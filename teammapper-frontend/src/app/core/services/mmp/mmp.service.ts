import { Injectable, OnDestroy, inject } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import { jsPDF } from 'jspdf';
import { first } from 'rxjs/operators';
import * as mmp from '@mmp/index';
import MmpMap from '@mmp/map/map';
import DOMPurify from 'dompurify';
import {
  ExportHistory,
  ExportNodeProperties,
  MapSnapshot,
  OptionParameters,
  UserNodeProperties,
} from '@mmp/map/types';
import { COLORS, EMPTY_IMAGE_DATA } from './mmp-utils';
import { CachedMapOptions } from 'src/app/shared/models/cached-map.model';
import { validate as uuidValidate } from 'uuid';
import { ExportService } from '../export/export.service';

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

  private currentMap: MmpMap;

  private readonly branchColors: string[];
  // additional options that are not handled within mmp, like fontMaxSize etc.
  private additionalOptions: CachedMapOptions;
  private settingsSubscription: Subscription;

  constructor() {
    const settingsService = this.settingsService;

    this.additionalOptions = null;
    this.branchColors = COLORS;

    this.settingsSubscription = settingsService
      .getEditModeObservable()
      .pipe(first((val: boolean | null) => val !== null))
      .subscribe((result: boolean | null) => {
        if (!this.currentMap) return;

        this.currentMap.options.update('drag', result);
        this.currentMap.options.update('edit', result);
      });
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
    const map: MmpMap = mmp.create(id, ref, options);

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
    this.currentMap = undefined;
  }

  /**
   * Clear or load an existing mind mmp.
   */
  public async new(map?: MapSnapshot, notifyWithEvent = true) {
    const hasInvalidUUID = map.some(node => !uuidValidate(node.id));

    if (hasInvalidUUID) {
      const importErrorMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.IMPORT_ERROR'
      );
      this.toastrService.error(importErrorMessage);
      return;
    }

    const mapWithCoordinates =
      this.currentMap.instance.applyCoordinatesToMapSnapshot(map);
    this.currentMap.instance.new(mapWithCoordinates, notifyWithEvent);
  }

  /**
   * Zoom in the mind mmp.
   */
  public zoomIn(duration?: number) {
    this.currentMap.instance.zoomIn(duration);
  }

  /**
   * Zoom out the mind mmp.
   */
  public zoomOut(duration?: number) {
    this.currentMap.instance.zoomOut(duration);
  }

  /**
   * Update the mind mmp option properties.
   */
  public updateOptions(property: string, value: any) {
    this.currentMap.instance.updateOptions(property, value);
  }

  /**
   * Update the additional map settings
   */
  public async updateAdditionalMapOptions(options: CachedMapOptions) {
    const defaultOptions = await this.defaultAdditionalOptions();
    this.additionalOptions = { ...defaultOptions, ...options };
  }

  /**
   * Get the additional options
   */
  public getAdditionalMapOptions(): CachedMapOptions {
    return this.additionalOptions;
  }

  /**
   * Return the json of the mind mmp.
   */
  public exportAsJSON(): MapSnapshot {
    return this.currentMap.instance.exportAsJSON();
  }

  /**
   * Return a promise with the uri of the mind mmp image.
   */
  public exportAsImage(type?: string): Promise<string> {
    return new Promise(resolve => {
      this.currentMap.instance.exportAsImage(uri => {
        resolve(uri);
      }, type);
    });
  }

  /**
   * Return the array of snapshots of the mind map.
   */
  public history(): ExportHistory {
    return this.currentMap?.instance?.history();
  }

  /**
   * Save the current snapshot to history
   */
  public save() {
    return this.currentMap.instance.save();
  }

  /**
   * Center the mind mmp.
   */
  public center(type?: 'position' | 'zoom', duration?: number) {
    this.currentMap.instance.center(type, duration);
  }

  /**
   * Return the subscribe of the mind mmp event with the node or nothing.
   */
  public on(event: string): Observable<any> {
    return new Observable(observer => {
      this.currentMap.instance.on(event, args => {
        observer.next(args);
      });
    });
  }

  /**
   * Adds already created nodes from the server to the local map
   *
   * @param nodes Given nodes from the server
   */
  public addNodesFromServer(nodes?: ExportNodeProperties[]) {
    this.currentMap.instance.addNodes(nodes);
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

    // detached nodes are not available as parent
    if (this.selectNode()?.detached) {
      return;
    }
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
      const currentNode = this.selectNode();
      newProps.coordinates = {
        x: currentNode.coordinates.x,
        y: currentNode.coordinates.y - 80,
      };
    }

    this.currentMap.instance.addNode(
      newProps,
      notifyWithEvent,
      true,
      parent?.id,
      properties?.id
    );
  }

  /**
   * Select the node with the id or in the direction passed as parameter.
   * If the node id is not defined return the current selected node.
   */
  public selectNode(
    nodeId?: string | 'left' | 'right' | 'up' | 'down'
  ): ExportNodeProperties {
    return this.currentMap.instance.selectNode(nodeId);
  }

  /**
   * exports the root node props
   */
  public getRootNode(): ExportNodeProperties {
    return this.currentMap.instance.exportRootProperties();
  }

  /**
   * exports the given node props
   */
  public getNode(nodeId: string): ExportNodeProperties {
    return this.currentMap.instance.exportNodeProperties(nodeId);
  }

  /**
   * Checks if a given node actually exists
   */
  public existNode(nodeId: string): boolean {
    return this.currentMap.instance.existNode(nodeId);
  }

  /**
   * Highlights a node
   */
  public highlightNode(
    nodeId: string,
    color: string,
    notifyWithEvent = true
  ): void {
    return this.currentMap.instance.highlightNode(
      nodeId,
      color,
      notifyWithEvent
    );
  }

  /**
   * Focus the text of the selected node to edit it.
   */
  public editNode() {
    this.currentMap.instance.editNode();
  }

  /**
   * Get the currently selected node
   */
  public getSelectedNode() {
    if (this.currentMap) {
      return this.currentMap.instance.getSelectedNode();
    }
  }

  /**
   * Deselect the current node.
   */
  public deselectNode() {
    this.currentMap.instance.deselectNode();
  }

  /**
   * Update a property of the current selected node.
   */
  public async updateNode(
    property: string,
    value?: any,
    notifyWithEvent?: boolean,
    updateHistory?: boolean,
    id?: string
  ) {
    try {
      this.currentMap.instance.updateNode(
        property,
        value,
        notifyWithEvent,
        updateHistory,
        id
      );
    } catch (e) {
      if (e.message == 'The root node can not be locked') {
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
      this.currentMap.instance.removeNode(nodeId, notifyWithEvent);
    } catch (e) {
      if (e.message == 'The root node can not be deleted') {
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
      this.currentMap.instance.copyNode(nodeId);

      const successMessage =
        await this.utilsService.translate('TOASTS.NODE_COPIED');
      this.toastrService.success(successMessage);
    } catch (e) {
      if (e.message == 'The root node can not be copied') {
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
      this.currentMap.instance.cutNode(nodeId);

      const successMessage =
        await this.utilsService.translate('TOASTS.NODE_CUT');
      this.toastrService.success(successMessage);
    } catch (e) {
      if (e.message == 'The root node can not be cut') {
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
      this.currentMap.instance.pasteNode(nodeId);
    } catch (e) {
      if (e.message == 'There are not nodes in the mmp clipboard') {
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
    this.currentMap.instance.toggleBranchVisibility();
  }

  /**
   * Return the children of the current node.
   */
  public nodeChildren(): ExportNodeProperties[] {
    return this.currentMap?.instance.nodeChildren();
  }

  /**
   * Move the node in a direction.
   */
  public moveNodeTo(direction: 'left' | 'right' | 'up' | 'down', range = 10) {
    const coordinates = this.currentMap.instance.selectNode().coordinates;

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

    this.currentMap.instance.updateNode('coordinates', coordinates);
  }

  /**
   * Export the current mind map with the format passed as parameter.
   */
  public async exportMap(
    format = 'json'
  ): Promise<{ success: boolean; size?: number }> {
    const name = DOMPurify.sanitize(
      this.getRootNode().name.replace(/\n/g, ' ').replace(/\s+/g, ' ')
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
   * Set the current mind mmp.
   */
  public setCurrentMap(map: MmpMap): void {
    this.currentMap = map;
  }

  /**
   * Get the current mind mmp.
   */
  public getCurrentMap(): MmpMap {
    return this.currentMap;
  }

  /**
   * Returns the current selected Node
   */
  public exportSelectedNode(): ExportNodeProperties {
    return this.currentMap.instance.exportSelectedNode();
  }

  /**
   * Reverse the last one change of the mind mmp.
   */
  public undo() {
    this.currentMap.instance.undo();
  }

  /**
   * Repeat a previously undoed change of the mind mmp.
   */
  public redo() {
    this.currentMap.instance.redo();
  }

  /**
   * Initialize additional map settings with defaults
   */
  private async defaultAdditionalOptions(): Promise<CachedMapOptions> {
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
