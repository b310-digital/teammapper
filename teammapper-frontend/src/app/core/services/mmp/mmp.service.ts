import { Injectable, OnDestroy, inject } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import { jsPDF } from 'jspdf';
import { filter } from 'rxjs/operators';
import { create, MmpMap, OptionParameters } from '@teammapper/mmp';
import DOMPurify from 'dompurify';
import {
  CachedMapOptions,
  ExportNodeProperties,
  MapOptions,
  MapSnapshot,
  MmpEventPayloadMap,
  NodeProperty,
  NodePropertyValue,
  UserNodeProperties,
} from '@teammapper/shared';
import { COLORS, EMPTY_IMAGE_DATA } from './mmp-utils';
import { validate as uuidValidate } from 'uuid';
import { ExportService } from '../export/export.service';

/**
 * `catch` binds `unknown`. mmp throws the conditions below as `Error` instances
 * (see `Log.error`), so narrow the value before reading the message.
 */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

  private readonly branchColors: string[];
  // additional options that are not handled within mmp, like fontMaxSize etc.
  // `create` resolves them; before that there is no map to hold options for.
  private additionalOptions: AdditionalMapOptions | null = null;
  private settingsSubscription: Subscription;

  constructor() {
    const settingsService = this.settingsService;

    this.branchColors = COLORS;

    this.settingsSubscription = settingsService
      .getEditModeObservable()
      .pipe(filter((val: boolean | null): val is boolean => val !== null))
      .subscribe((result: boolean) => {
        if (!this.currentMap) return;

        this.currentMap.options.update('drag', result);
        this.currentMap.options.update('edit', result);
      });
  }

  /**
   * The map this service is attached to. Most of the operations below need
   * one, so calling them before `create` is a programming error, and this
   * throws instead of returning null. A few methods run before `create`. Those
   * read `currentMap` directly and return early.
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
   * Create a mindmap using mmp and save the instance with corresponding id.
   * All function below require the mmp id.
   */
  public async create(
    id: string,
    ref: HTMLElement,
    options?: OptionParameters
  ) {
    const map: MmpMap = create(id, ref, options);

    // additional options do not include the standard mmp map options
    this.additionalOptions = await this.defaultAdditionalOptions();

    this.currentMap = map;
  }

  /**
   * Remove the mind mmp.
   */
  public remove() {
    if (!this.currentMap) return;

    this.currentMap.instance.unsubscribeAll();
    this.currentMap.instance.remove();
    this.currentMap = null;
  }

  /**
   * Clear or load an existing mind mmp.
   */
  public async new(map: MapSnapshot, notifyWithEvent = true) {
    const hasInvalidUUID = map.some(node => !uuidValidate(node.id));

    if (hasInvalidUUID) {
      const importErrorMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.IMPORT_ERROR'
      );
      this.toastrService.error(importErrorMessage);
      return;
    }

    const mapWithCoordinates =
      this.map.instance.applyCoordinatesToMapSnapshot(map);
    this.map.instance.new(mapWithCoordinates, notifyWithEvent);
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
   * Return the subscribe of the mind mmp event with the node or nothing.
   */
  public on<K extends keyof MmpEventPayloadMap>(
    event: K
  ): Observable<MmpEventPayloadMap[K]>;
  public on<T = unknown>(event: string): Observable<T>;
  public on(event: string): Observable<unknown> {
    return new Observable(observer => {
      this.map.instance.on(event, (args: unknown) => {
        observer.next(args);
      });
    });
  }

  /**
   * Adds already created nodes from the server to the local map
   *
   * @param nodes Given nodes from the server
   */
  public addNodesFromServer(nodes: ExportNodeProperties[]) {
    this.map.instance.addNodes(nodes);
  }

  /**
   * Add a node in the mind mmp triggered by the user.
   *
   * Detached nodes can be used as comments and are not assigned to a parent node
   */
  public addNode(
    properties?: Partial<ExportNodeProperties>,
    notifyWithEvent = true
  ) {
    const newProps: UserNodeProperties = properties || { name: '' };
    const parent = properties?.parent
      ? this.selectNode(properties.parent)
      : !properties?.detached
        ? this.selectNode()
        : null;
    const settings = this.settingsService.getCachedUserSettings();

    if (properties?.colors?.branch) {
      newProps.colors = {
        branch: properties.colors.branch,
      };
    } else if (parent?.colors?.branch) {
      newProps.colors = {
        branch: parent.colors.branch,
      };
    } else if (
      settings !== null &&
      settings.mapOptions !== null &&
      settings.mapOptions.autoBranchColors === true
    ) {
      const children = this.nodeChildren().length;

      newProps.colors = {
        branch: this.branchColors[children % this.branchColors.length],
      };
    }

    if (properties?.detached) {
      // Place a detached node above the node the user created it from
      const coordinates = this.selectNode().coordinates;

      if (coordinates) {
        newProps.coordinates = { x: coordinates.x, y: coordinates.y - 80 };
      }
    }

    this.map.instance.addNode(
      newProps,
      notifyWithEvent,
      true,
      parent?.id,
      properties?.id
    );
  }

  /**
   * Add the root of a new tree, placed clear of every tree this client holds.
   * The root has no parent and no main-root mark.
   */
  public addTree() {
    const coordinates = this.map.instance.newTreeCoordinates();
    this.map.instance.addNode({ name: '', coordinates }, true, true, null);
  }

  /**
   * Select the node with the id or in the direction passed as parameter.
   * If the node id is not defined return the current selected node.
   */
  public selectNode(
    nodeId?: string | 'left' | 'right' | 'up' | 'down'
  ): ExportNodeProperties {
    return this.map.instance.selectNode(nodeId);
  }

  /**
   * exports the root node props
   */
  public getRootNode(): ExportNodeProperties {
    return this.map.instance.exportRootProperties();
  }

  /**
   * Checks if a given node actually exists
   */
  public existNode(nodeId: string): boolean {
    return this.map.instance.existNode(nodeId);
  }

  /**
   * Highlights a node
   */
  public highlightNode(
    nodeId: string,
    color: string,
    notifyWithEvent = true
  ): void {
    return this.map.instance.highlightNode(nodeId, color, notifyWithEvent);
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
    notifyWithEvent?: boolean,
    updateHistory?: boolean,
    id?: string
  ) {
    try {
      this.map.instance.updateNode(
        property,
        value,
        notifyWithEvent,
        updateHistory,
        id
      );
    } catch (e) {
      if (errorMessage(e) == 'The root node can not be locked') {
        const rootNodeFailureMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.ROOT_NODE_LOCKED'
        );
        this.toastrService.error(rootNodeFailureMessage);
      } else {
        const genericErrorMessage = await this.utilsService.translate(
          'TOASTS.ERRORS.NODE_UPDATE_GENERIC'
        );
        this.toastrService.error(genericErrorMessage);
      }
    }
  }

  /**
   * Remove the node with the id passed as parameter or, if the id is
   * not defined, the current selected node.
   */
  public async removeNode(nodeId?: string, notifyWithEvent = true) {
    try {
      this.map.instance.removeNode(nodeId, notifyWithEvent);
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
    try {
      this.map.instance.copyNode(nodeId);

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
    try {
      this.map.instance.cutNode(nodeId);

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
    try {
      this.map.instance.pasteNode(nodeId);
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
   * Toggle (hide/show) all child nodes of the selected node
   */
  public toggleBranchVisibility() {
    this.map.instance.toggleBranchVisibility();
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
    return this.currentMap?.instance.nodeChildren() ?? [];
  }

  /**
   * Move the node in a direction.
   */
  public moveNodeTo(direction: 'left' | 'right' | 'up' | 'down', range = 10) {
    const coordinates = this.map.instance.selectNode().coordinates;
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
      (this.getRootNode().name ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ')
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
   * Insert an image in the selected node.
   */
  public addNodeImage(image: string | ArrayBuffer) {
    this.updateNode('imageSrc', image);
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
    const json = JSON.stringify(this.exportAsJSON());
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
}
