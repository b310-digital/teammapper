import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import { jsPDF } from 'jspdf';
import { filter } from 'rxjs/operators';
import { create, MapData, MmpMap, OptionParameters } from '@teammapper/mmp';
import DOMPurify from 'dompurify';
import {
  CachedMapOptions,
  ExportNodeProperties,
  MapOptions,
  MapSnapshot,
  MmpEventPayloadMap,
  MmpEventType,
  NodeProperty,
  NodePropertyValue,
  UserNodeProperties,
  findRootNodes,
  ImageReference,
  isImageReference,
} from '@teammapper/shared';
import { COLORS, EMPTY_IMAGE_DATA } from './mmp-utils';
import {
  blobToDataUrl,
  ImageHandlers,
  ImageUploadError,
  resizeImage,
} from './node-images';
import { validate as uuidValidate } from 'uuid';
import { ExportService } from '../export/export.service';

/**
 * `catch` binds `unknown`. mmp throws the conditions below as `Error` instances
 * (see `Log.error`), so narrow the value before reading the message.
 */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Node names use the font `styles.scss` ships, so a name has the same width
 * on every system. An exported image cannot load it and falls back to Arial.
 */
export const NODE_FONT_FAMILY = "'Fira Sans', Arial, sans-serif";

/** The formats `exportMap` knows how to write. */
export type ExportFormat = 'json' | 'pdf' | 'mermaid' | 'svg' | 'jpeg' | 'png';

/**
 * The font options mmp does not handle itself. The shared MapOptions leaves
 * them optional because a stored map may omit them; MmpService resolves them
 * against the configured defaults before handing them out.
 */
export type AdditionalMapOptions = Required<MapOptions>;

/**
 * Mmp wrapper service with mmp and other functions.
 */
@Injectable({
  providedIn: 'root',
})
export class MmpService implements OnDestroy {
  settingsService = inject(SettingsService);
  utilsService = inject(UtilsService);
  toastrService = inject(ToastrService);
  private exportService = inject(ExportService);

  private currentMap: MmpMap | null = null;
  // The last edit mode SettingsService reported, which `create` applies to
  // a map created after the report.
  private editMode: boolean | null = null;
  // Counts the calls of `create` and `remove`, so a create that awaited its
  // options can tell that a newer one or a removal ran during the wait.
  private creations = 0;
  private readonly mapCreatedSubject = new BehaviorSubject<boolean>(false);
  /**
   * True once the map is created and wired up, false again after `remove`.
   * The toolbar, the floating buttons and the shortcuts act only while true.
   */
  public readonly mapCreated$: Observable<boolean> =
    this.mapCreatedSubject.asObservable();

  private readonly branchColors: string[];
  // additional options that are not handled within mmp, like fontMaxSize etc.
  // `create` resolves them; before that there is no map to hold options for.
  private additionalOptions: AdditionalMapOptions | null = null;
  private settingsSubscription: Subscription;
  // MapSyncService registers these; it holds the map uuid and the secret.
  private imageHandlers: ImageHandlers | null = null;

  constructor() {
    const settingsService = this.settingsService;

    this.branchColors = COLORS;

    this.settingsSubscription = settingsService
      .getEditModeObservable()
      .pipe(filter((val: boolean | null): val is boolean => val !== null))
      .subscribe((result: boolean) => {
        this.editMode = result;
        if (this.currentMap) this.applyEditMode(this.currentMap, result);
      });
  }

  /** Let the map edit and drag nodes only in edit mode. */
  private applyEditMode(map: MmpMap, editMode: boolean) {
    map.options.update('drag', editMode);
    map.options.update('edit', editMode);
  }

  /**
   * The map this service is attached to. The commands below need one, and
   * the UI calls them only once `mapCreated$` reports true, so a call before
   * `create` is a programming error and this throws instead of returning
   * null. The queries that templates call before `create`, and presence
   * updates call after `remove`, read `currentMap` directly and return a
   * default.
   */
  private get map(): MmpMap {
    if (!this.currentMap) {
      throw new Error('No mind map has been created yet');
    }
    return this.currentMap;
  }

  ngOnDestroy() {
    this.settingsSubscription.unsubscribe();
  }

  /**
   * Create a mind map with mmp over the map data, keep the instance and
   * return it. mmp draws every node the data holds while it creates the map.
   * The map takes the current edit mode and stays read-only while the edit
   * mode is unknown, so a read-only client never gets an editable map.
   * Returns null without
   * creating a map when a later `create` or a `remove` ran while the options
   * loaded, so a late create never replaces a newer map.
   */
  public async create(
    id: string,
    ref: HTMLElement,
    options: OptionParameters | undefined,
    data: MapData
  ): Promise<MmpMap | null> {
    const creation = ++this.creations;
    // additional options do not include the standard mmp map options
    const additionalOptions = await this.defaultAdditionalOptions();
    if (creation !== this.creations) return null;
    this.additionalOptions = additionalOptions;

    const map: MmpMap = create(id, ref, this.mapOptions(options), data);
    this.currentMap = map;
    map.instance.on('nodeProtected', () => void this.showProtectedNotice());
    return map;
  }

  /**
   * The mmp options of a new map: `options` with the app font as default,
   * the current edit mode, read-only while unknown, and the image resolver.
   */
  private mapOptions(options: OptionParameters | undefined): OptionParameters {
    const editable = this.editMode ?? false;
    return {
      fontFamily: NODE_FONT_FAMILY,
      ...options,
      edit: editable,
      drag: editable,
      resolveImageUrl: reference =>
        this.imageHandlers?.resolveUrl(reference) ?? null,
    };
  }

  /** Report that the map exists and is wired up; see `mapCreated$`. */
  public markMapCreated() {
    this.mapCreatedSubject.next(true);
  }

  /**
   * Tell the user that a protected branch refused the edit. A color picker
   * sends an update on every pointer move, so the method skips the notice
   * while an identical one is still on screen.
   */
  private async showProtectedNotice(): Promise<void> {
    const message = await this.utilsService.translate(
      'TOASTS.WARNINGS.NODE_PROTECTED'
    );
    if (this.toastrService.findDuplicate('', message, true, false)) return;
    this.toastrService.warning(message);
  }

  /**
   * Remove the map, the current one by default. The method destroys a map
   * that is no longer the current one, such as one a stale create returned,
   * and leaves the current map alone. Removing the current map also stops a
   * create that still loads its options.
   */
  public remove(map: MmpMap | null = this.currentMap) {
    if (map !== this.currentMap) {
      map?.instance.destroy();
      return;
    }

    this.creations++;
    this.mapCreatedSubject.next(false);
    if (!map) return;

    map.instance.destroy();
    this.currentMap = null;
  }

  /**
   * Replace the mind map with the given nodes: an import.
   */
  public async new(map: MapSnapshot) {
    const instance = this.map.instance;
    const hasInvalidUUID = map.some(node => !uuidValidate(node.id));

    if (hasInvalidUUID) {
      const importErrorMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.IMPORT_ERROR'
      );
      this.toastrService.error(importErrorMessage);
      return;
    }

    instance.new(instance.applyCoordinatesToMapSnapshot(map));
  }

  /**
   * Zoom in the mind mmp.
   */
  public zoomIn(duration?: number) {
    this.map.instance.zoomIn(duration);
  }

  /**
   * Zoom out the mind mmp.
   */
  public zoomOut(duration?: number) {
    this.map.instance.zoomOut(duration);
  }

  /**
   * Update the additional map settings
   */
  public async updateAdditionalMapOptions(options: CachedMapOptions) {
    const defaultOptions = await this.defaultAdditionalOptions();

    // A stored map may carry a key with no value, and spreading that over the
    // defaults would put the hole back.
    this.additionalOptions = {
      fontMaxSize: options.fontMaxSize ?? defaultOptions.fontMaxSize,
      fontMinSize: options.fontMinSize ?? defaultOptions.fontMinSize,
      fontIncrement: options.fontIncrement ?? defaultOptions.fontIncrement,
    };
  }

  /**
   * Get the additional options, or null while no map has been created.
   */
  public getAdditionalMapOptions(): AdditionalMapOptions | null {
    return this.additionalOptions;
  }

  /**
   * Return the json of the mind mmp.
   */
  public exportAsJSON(): MapSnapshot {
    return this.map.instance.exportAsJSON();
  }

  /**
   * Return the json of the mind map with every image reference replaced by a
   * data URL, so the file works without the server. A node whose image cannot
   * be fetched leaves the file without an image. `exportAsJSON` keeps the
   * references for the map cache and the Mermaid export.
   */
  public async exportAsJSONWithInlineImages(): Promise<MapSnapshot> {
    const snapshot = this.exportAsJSON();
    await Promise.all(
      snapshot.map(async node => {
        const src = node.image?.src;
        if (!node.image || !isImageReference(src)) return;
        node.image.src = await this.fetchImageAsDataUrl(src);
      })
    );
    return snapshot;
  }

  /** Fetches a referenced image as a data URL, or '' when that fails. */
  private async fetchImageAsDataUrl(
    reference: ImageReference
  ): Promise<string> {
    const url = this.imageHandlers?.resolveUrl(reference);
    if (!url) return '';
    try {
      const response = await fetch(url);
      if (!response.ok) return '';
      return await blobToDataUrl(await response.blob());
    } catch {
      return '';
    }
  }

  /**
   * Return a promise with the uri of the mind mmp image.
   */
  public exportAsImage(type?: string): Promise<string> {
    return new Promise(resolve => {
      this.map.instance.exportAsImage(uri => {
        resolve(uri);
      }, type);
    });
  }

  /**
   * Center the mind mmp.
   */
  public center(type?: 'position' | 'zoom', duration?: number) {
    this.map.instance.center(type, duration);
  }

  /**
   * Return an Observable of the mmp event. Each subscriber adds its own
   * callback to mmp, and unsubscribing removes it again.
   */
  public on<K extends MmpEventType>(
    event: K
  ): Observable<MmpEventPayloadMap[K]> {
    return new Observable(observer =>
      this.map.instance.on(event, payload => observer.next(payload))
    );
  }

  /**
   * Add a node in the mind mmp triggered by the user, then select it and
   * start editing its name.
   *
   * addNode puts a child under `properties.parent`, or under the selected
   * node when no parent is named, and adds no child when nothing is selected.
   * Call `addTree` to add a root node.
   */
  public addNode(properties?: Partial<ExportNodeProperties>) {
    const parent = this.selectNode(properties?.parent || undefined);
    if (!parent) return;

    const node = this.map.instance.addNode(
      this.newNodeProperties(parent, properties),
      parent.id,
      properties?.id
    );
    if (!node) return;

    this.selectNode(node.id);
    this.editNode();
  }

  /**
   * The properties of a new child of `parent`. The branch color comes from
   * the given properties, then from the parent, then from the automatic
   * branch colors setting.
   */
  private newNodeProperties(
    parent: ExportNodeProperties,
    properties?: Partial<ExportNodeProperties>
  ): UserNodeProperties {
    const newProps: UserNodeProperties = properties || { name: '' };
    const branch =
      properties?.colors?.branch ||
      parent.colors?.branch ||
      this.autoBranchColor();
    if (branch) newProps.colors = { branch };
    return newProps;
  }

  /**
   * The automatic branch color for the next child of the selected node, or
   * null when the user settings turn automatic branch colors off.
   */
  private autoBranchColor(): string | null {
    const settings = this.settingsService.getCachedUserSettings();
    if (settings?.mapOptions?.autoBranchColors !== true) return null;

    const children = this.nodeChildren().length;
    return this.branchColors[children % this.branchColors.length];
  }

  /**
   * Add the root of a new tree in the viewport, clear of every tree this
   * client holds, select it and start editing its name. The root has no
   * parent and its isRoot attribute is false.
   */
  public addTree() {
    const instance = this.map.instance;
    if (!instance.addTree()) return;
    instance.editNode();
  }

  /**
   * Select the node with the id or in the direction passed as parameter.
   * If the node id is not defined return the current selected node, or null
   * when nothing is selected or no map exists. Templates, `addNode` and
   * `moveNodeTo` call it while no map exists.
   */
  public selectNode(
    nodeId?: string | 'left' | 'right' | 'up' | 'down'
  ): ExportNodeProperties | null {
    return this.currentMap?.instance.selectNode(nodeId) ?? null;
  }

  /**
   * Return true when a node is selected, and false before `create` builds the
   * map.
   */
  public hasSelectedNode(): boolean {
    return !!this.getSelectedNode();
  }

  /**
   * Export the properties of the main root, or null for a map without one.
   */
  public getRootNode(): ExportNodeProperties | null {
    return this.map.instance.exportRootProperties();
  }

  /**
   * Return true when the map holds the node, and false while no map exists:
   * a peer's presence update can arrive after `remove`.
   */
  public existNode(nodeId: string): boolean {
    return this.currentMap?.instance.existNode(nodeId) ?? false;
  }

  /**
   * Draw a ring in the color around the node. A peer's presence update can
   * arrive after `remove`, and then this draws nothing.
   */
  public highlightNode(nodeId: string, color: string): void {
    this.currentMap?.instance.highlightNode(nodeId, color);
  }

  /**
   * Focus the text of the selected node to edit it.
   */
  public editNode() {
    this.map.instance.editNode();
  }

  /**
   * Get the currently selected node
   */
  public getSelectedNode() {
    return this.currentMap?.instance.getSelectedNode();
  }

  /**
   * Update a property of the current selected node.
   */
  public async updateNode(
    property: NodeProperty | string,
    value?: NodePropertyValue | ArrayBuffer | unknown,
    id?: string
  ) {
    const instance = this.map.instance;
    try {
      instance.updateNode(property, value, id);
    } catch {
      const genericErrorMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.NODE_UPDATE_GENERIC'
      );
      this.toastrService.error(genericErrorMessage);
    }
  }

  /**
   * Return the id of the node protecting the selected node, itself or an
   * ancestor, or null when the selected node is not protected or no map exists.
   */
  public protectingNode(): string | null {
    return this.currentMap?.instance.protectingNode() ?? null;
  }

  /**
   * Protect the selected node and its branch, or release the protection of
   * the branch the selected node belongs to. mmp writes the whole toggle as
   * one batch, so peers never see a child released before its parent is
   * protected.
   */
  public toggleBranchProtection() {
    const instance = this.map.instance;
    if (this.protectingNode() === null) instance.protectBranch();
    else instance.releaseBranch();
  }

  /**
   * Remove the node with the id passed as parameter or, if the id is
   * not defined, the current selected node.
   */
  public async removeNode(nodeId?: string) {
    const instance = this.map.instance;
    try {
      instance.removeNode(nodeId);
    } catch (e) {
      if (errorMessage(e) == 'The root node can not be deleted') {
        const rootNodeFailureMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.ROOT_NODE_DELETED'
        );
        this.toastrService.error(rootNodeFailureMessage);
      } else {
        const genericErrorMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.NODE_DELETION_GENERIC'
        );
        this.toastrService.error(genericErrorMessage);
      }
    }
  }

  /**
   * Copy a node with his children in the mmp clipboard.
   * If id is not specified, copy the selected node.
   */
  public async copyNode(nodeId?: string) {
    const instance = this.map.instance;
    if (!nodeId && !this.hasSelectedNode()) return;

    try {
      instance.copyNode(nodeId);

      const successMessage =
        await this.utilsService.translate('TOASTS.NODE_COPIED');
      this.toastrService.success(successMessage);
    } catch (e) {
      if (errorMessage(e) == 'The root node can not be copied') {
        const rootNodeFailureMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.ROOT_NODE_COPIED'
        );
        this.toastrService.error(rootNodeFailureMessage);
      } else {
        const genericErrorMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.NODE_COPY_GENERIC'
        );
        this.toastrService.error(genericErrorMessage);
      }
    }
  }

  /**
   * Remove and copy a node with his children in the mmp clipboard.
   * If id is not specified, copy the selected node.
   */
  public async cutNode(nodeId?: string) {
    const instance = this.map.instance;
    if (!nodeId && !this.hasSelectedNode()) return;

    try {
      if (!instance.cutNode(nodeId)) return;

      const successMessage =
        await this.utilsService.translate('TOASTS.NODE_CUT');
      this.toastrService.success(successMessage);
    } catch (e) {
      if (errorMessage(e) == 'The root node can not be cut') {
        const rootNodeFailureMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.ROOT_NODE_CUT'
        );
        this.toastrService.error(rootNodeFailureMessage);
      } else {
        const genericErrorMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.NODE_CUT_GENERIC'
        );
        this.toastrService.error(genericErrorMessage);
      }
    }
  }

  /**
   * Paste the node of the mmp clipboard in the map. If id is not specified,
   * paste the nodes of the mmp clipboard in the selected node.
   */
  public async pasteNode(nodeId?: string) {
    const instance = this.map.instance;
    try {
      this.pasteFromClipboard(instance, nodeId);
    } catch (e) {
      if (errorMessage(e) == 'There are not nodes in the mmp clipboard') {
        const rootNodeFailureMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.NO_NODES_IN_CLIPBOARD'
        );
        this.toastrService.error(rootNodeFailureMessage);
      } else {
        const genericErrorMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.NODE_PASTE_GENERIC'
        );
        this.toastrService.error(genericErrorMessage);
      }
    }
  }

  /**
   * Paste as an independent tree when the caller names no node and nothing is
   * selected. Paste under the named or the selected node otherwise.
   */
  private pasteFromClipboard(instance: MmpMap['instance'], nodeId?: string) {
    const asTree = !nodeId && !this.hasSelectedNode();

    if (asTree) instance.pasteTree();
    else instance.pasteNode(nodeId);
  }

  /**
   * Toggle (hide/show) all child nodes of the selected node
   */
  public toggleBranchVisibility() {
    this.map.instance.toggleBranchVisibility();
  }

  /**
   * Return true when this person hid the child nodes of the selected node,
   * and false with nothing selected or before `create` builds the map.
   */
  public childNodesHidden(): boolean {
    return this.currentMap?.instance.childNodesHidden() ?? false;
  }

  /**
   * Recompute every node's position from the tree, discarding manual placement.
   */
  public distributeNodes() {
    this.map.instance.distributeNodes();
  }

  /**
   * Return the children of the current node.
   */
  public nodeChildren(): ExportNodeProperties[] {
    return this.map.instance.nodeChildren();
  }

  /**
   * Move the node in a direction.
   */
  public moveNodeTo(direction: 'left' | 'right' | 'up' | 'down', range = 10) {
    const coordinates = this.selectNode()?.coordinates;
    if (!coordinates) return;

    switch (direction) {
      case 'left':
        coordinates.x -= range;
        break;
      case 'right':
        coordinates.x += range;
        break;
      case 'up':
        coordinates.y -= range;
        break;
      case 'down':
        coordinates.y += range;
        break;
    }

    this.map.instance.updateNode('coordinates', coordinates);
  }

  /**
   * Export the current mind map with the format passed as parameter.
   */
  public async exportMap(
    format: ExportFormat = 'json'
  ): Promise<{ success: boolean; size?: number }> {
    const name = DOMPurify.sanitize(
      (this.getRootNode()?.name ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ')
    );

    switch (format) {
      case 'json': {
        return this.exportToJSON(format, name);
      }
      case 'pdf': {
        return this.exportToPDF(format, name);
      }
      case 'mermaid': {
        return this.exportToMermaid(name);
      }
      case 'svg':
      case 'jpeg':
      case 'png': {
        return this.exportToImage(format, name);
      }
      default: {
        return { success: false };
      }
    }
  }

  /**
   * Import an existing map from the local file system.
   */
  public importMap(json: string) {
    this.new(JSON.parse(json));
  }

  /**
   * Register how the open map resolves and uploads images.
   */
  public registerImageHandlers(handlers: ImageHandlers) {
    this.imageHandlers = handlers;
  }

  /**
   * Upload an image and set its reference on the node that was selected when
   * the upload started. Pass `resize` for a picked or dropped file; a
   * pictogram skips it, since it would turn a transparent background black.
   * On failure the node keeps its image and the user sees an error.
   */
  public async addNodeImage(image: Blob, resize = false): Promise<void> {
    const node = this.getSelectedNode();
    if (!node) return;

    try {
      if (!this.imageHandlers)
        throw new Error('No image handlers are registered');
      const upload = resize ? await resizeImage(image) : image;
      const reference = await this.imageHandlers.upload(upload);
      // The upload succeeded; a node deleted meanwhile needs no image and no
      // error. The cleanup job deletes the unused image.
      if (!this.existNode(node.id)) return;
      await this.updateNode('imageSrc', reference, node.id);
    } catch (error) {
      await this.showImageUploadError(error);
    }
  }

  /**
   * A 413 means the map's cap in practice, since the resize keeps files below
   * the size limit.
   */
  private async showImageUploadError(error: unknown): Promise<void> {
    const key =
      error instanceof ImageUploadError && error.status === 413
        ? 'TOASTS.ERRORS.IMAGE_STORAGE_FULL'
        : 'TOASTS.ERRORS.IMAGE_UPLOAD_ERROR';
    this.toastrService.error(await this.utilsService.translate(key));
  }

  /**
   * Inserts a link in the selected node.
   */
  public addNodeLink(href: string) {
    this.updateNode('linkHref', href);
  }

  /**
   * Removes a link in the selected node.
   */
  public removeNodeLink() {
    this.updateNode('linkHref', '');
  }

  /**
   * Removes an image of the selected node.
   */
  public removeNodeImage() {
    this.updateNode('imageSrc', '');
  }

  /**
   * Initialize additional map settings with defaults
   */
  private async defaultAdditionalOptions(): Promise<AdditionalMapOptions> {
    const defaultSettings = (await this.settingsService.getDefaultSettings())
      .userSettings;

    return {
      fontMinSize: defaultSettings.mapOptions.fontMinSize,
      fontMaxSize: defaultSettings.mapOptions.fontMaxSize,
      fontIncrement: defaultSettings.mapOptions.fontIncrement,
    };
  }

  /**
   * Export map to image (png, jpg, svg)
   */
  private async exportToImage(
    format: string,
    name: string
  ): Promise<{ success: boolean; size?: number }> {
    const image = await this.exportAsImage(format);

    if (image === EMPTY_IMAGE_DATA) {
      const exportImageFailureMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.EXPORT_IMAGE_ERROR'
      );
      this.toastrService.error(exportImageFailureMessage);
      return { success: false };
    } else {
      UtilsService.downloadFile(
        `${name}.${format === 'jpeg' ? 'jpg' : format}`,
        image
      );

      return { success: true, size: image.length / 1024 };
    }
  }

  /**
   * Export map to PDF
   */
  private async exportToPDF(
    format: string,
    name: string
  ): Promise<{ success: boolean; size?: number }> {
    const imageUri = await this.exportAsImage('png');
    const htmlImageElement = await UtilsService.imageFromUri(imageUri);
    const pdf = new jsPDF({
      orientation: htmlImageElement.width > htmlImageElement.height ? 'l' : 'p',
      unit: 'pt',
      format: 'A4',
    });
    const pdfWidth: number = pdf.internal.pageSize.getWidth();
    const pdfHeight: number = pdf.internal.pageSize.getHeight();

    const scaleFactorWidth: number = pdfWidth / htmlImageElement.width;
    const scaleFactorHeight: number = pdfHeight / htmlImageElement.height;

    if (
      pdfWidth > htmlImageElement.width &&
      pdfHeight > htmlImageElement.height
    ) {
      // 0.75 to convert px to pt
      pdf.addImage(
        imageUri,
        0,
        0,
        htmlImageElement.width * 0.75,
        htmlImageElement.height * 0.75,
        '',
        'MEDIUM',
        0
      );
    } else if (scaleFactorWidth < scaleFactorHeight) {
      pdf.addImage(
        imageUri,
        0,
        0,
        htmlImageElement.width * scaleFactorWidth,
        htmlImageElement.height * scaleFactorWidth,
        '',
        'MEDIUM',
        0
      );
    } else {
      pdf.addImage(
        imageUri,
        0,
        0,
        htmlImageElement.width * scaleFactorHeight,
        htmlImageElement.height * scaleFactorHeight,
        '',
        'MEDIUM',
        0
      );
    }

    pdf.save(`${name}.${format}`);

    return { success: true, size: pdf.output().length };
  }

  /**
   * Export map to JSON
   */
  private async exportToJSON(
    format: string,
    name: string
  ): Promise<{ success: boolean; size?: number }> {
    const json = JSON.stringify(await this.exportAsJSONWithInlineImages());
    const uri = `data:text/json;charset=utf-8,${encodeURIComponent(json)}`;

    const fileSizeKb = uri.length / 1024;

    UtilsService.downloadFile(`${name}.${format}`, uri);

    return { success: true, size: fileSizeKb };
  }

  /**
   * Export map to Mermaid format
   */
  private async exportToMermaid(
    name: string
  ): Promise<{ success: boolean; size?: number }> {
    try {
      const nodes = this.exportAsJSON();
      const mermaidContent = this.exportService.exportToMermaid(nodes);

      // Create blob and download
      const blob = new Blob([mermaidContent], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.download = `${name}.mmd`;
      link.href = url;
      link.click();

      URL.revokeObjectURL(url);
      await this.warnOfSeveralMermaidBlocks(nodes);

      const fileSizeKb = blob.size / 1024;

      return { success: true, size: fileSizeKb };
    } catch (_error) {
      const exportErrorMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.EXPORT_IMAGE_ERROR'
      );
      this.toastrService.error(exportErrorMessage);
      return { success: false };
    }
  }

  /**
   * Tells the user that the export wrote one `mindmap` block per tree, since
   * Mermaid tools outside TeamMapper accept one block per text.
   */
  private async warnOfSeveralMermaidBlocks(
    nodes: ExportNodeProperties[]
  ): Promise<void> {
    if (findRootNodes(nodes).length < 2) return;
    const message = await this.utilsService.translate(
      'TOASTS.WARNINGS.MERMAID_SEVERAL_TREES'
    );
    this.toastrService.info(message);
  }
}
