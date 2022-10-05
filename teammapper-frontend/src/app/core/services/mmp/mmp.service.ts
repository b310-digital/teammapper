import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { SettingsService } from '../settings/settings.service'
import { UtilsService } from '../utils/utils.service'
import { jsPDF } from 'jspdf'
import * as mmp from '@mmp/index'
import MmpMap from '@mmp/map/map'
import { ExportHistory, ExportNodeProperties, MapSnapshot, UserNodeProperties } from '@mmp/map/types'
import { MapOptions } from 'src/app/shared/models/settings.model'
import { COLORS } from './mmp-utils'

/**
 * Mmp wrapper service with mmp and other functions.
 */
@Injectable({
  providedIn: 'root'
})
export class MmpService {
  private maps: Map<string, MmpMap>
  private currentMap: MmpMap

  private readonly branchColors: Array<string>

  constructor (public settingsService: SettingsService) {
    this.maps = new Map<string, MmpMap>()
    this.branchColors = COLORS
  }

  /**
     * Create a mind mmp and save the instance with corresponding id.
     * All function below require the mmp id.
     */
  public create (id: string, options?: MapOptions) {
    const map: MmpMap = mmp.create(id, options)

    this.maps.set(id, map)

    this.currentMap = map
  }

  /**
     * Remove the mind mmp.
     */
  public remove () {
    this.currentMap.instance.remove()
  }

  /**
     * Clear or load an existing mind mmp.
     */
  public new (map?: MapSnapshot, notifyWithEvent = true) {
    this.currentMap.instance.new(map, notifyWithEvent)
  }

  /**
     * Zoom in the mind mmp.
     */
  public zoomIn (duration?: number) {
    this.currentMap.instance.zoomIn(duration)
  }

  /**
     * Zoom out the mind mmp.
     */
  public zoomOut (duration?: number) {
    this.currentMap.instance.zoomOut(duration)
  }

  /**
     * Update the mind mmp option properties.
     */
  public updateOptions (property: string, value: any) {
    this.currentMap.instance.updateOptions(property, value)
  }

  /**
     * Return the json of the mind mmp.
     */
  public exportAsJSON (): MapSnapshot {
    return this.currentMap.instance.exportAsJSON()
  }

  /**
     * Return a promise with the uri of the mind mmp image.
     */
  public exportAsImage (type?: string): Promise<string> {
    return new Promise((resolve) => {
      this.currentMap.instance.exportAsImage((uri) => {
        resolve(uri)
      }, type)
    })
  }

  /**
     * Return the array of snapshots of the mind map.
     */
  public history (): ExportHistory {
    return this.currentMap.instance.history()
  }

  /**
     * Center the mind mmp.
     */
  public center (type?: 'position' | 'zoom', duration?: number) {
    this.currentMap.instance.center(type, duration)
  }

  /**
     * Return the subscribe of the mind mmp event with the node or nothing.
     */
  public on (event: string): Observable<any> {
    return new Observable((observer) => {
      this.currentMap.instance.on(event, (...args) => {
        observer.next(...args)
      })
    })
  }

  /**
     * Add a node in the mind mmp.
     */
  public addNode (properties?: ExportNodeProperties, notifyWithEvent = true) {
    const newProps: UserNodeProperties = properties || { name: '' }
    // when the method is called with no params (from shortcut service), use the current selected node as parent
    const parent = properties?.parent ? this.getNode(properties.parent) : this.selectNode()
    const settings = this.settingsService.getCachedSettings()

    if (properties?.colors?.branch) {
      newProps.colors = {
        branch: properties.colors.branch
      }
    } else if (parent?.colors?.branch) {
      newProps.colors = {
        branch: parent.colors.branch
      }
    } else if (settings !== null && settings.mapOptions !== null && settings.mapOptions.autoBranchColors === true) {
      const children = this.nodeChildren().length

      newProps.colors = {
        branch: this.branchColors[children % this.branchColors.length]
      }
    }

    this.currentMap.instance.addNode(newProps, notifyWithEvent, properties?.parent, properties?.id)
    this.editNode()
  }

  /**
     * Select the node with the id or in the direction passed as parameter.
     * If the node id is not defined return the current selected node.
     */
  public selectNode (nodeId?: string | 'left' | 'right' | 'up' | 'down'): ExportNodeProperties {
    return this.currentMap.instance.selectNode(nodeId)
  }

  /**
     * exports the root node props
     */
  public getRootNode (): ExportNodeProperties {
    return this.currentMap.instance.exportRootProperties()
  }

  /**
     * exports the given node props
     */
  public getNode (nodeId: string): ExportNodeProperties {
    return this.currentMap.instance.exportNodeProperties(nodeId)
  }

  /**
     * Checks if a given node actually exists
     */
  public existNode (nodeId: string): boolean {
    return this.currentMap.instance.existNode(nodeId)
  }

  /**
     * Highlights a node
     */
  public highlightNode (nodeId: string, color: string, notifyWithEvent = true): void {
    return this.currentMap.instance.highlightNode(nodeId, color, notifyWithEvent)
  }

  /**
     * Focus the text of the selected node to edit it.
     */
  public editNode () {
    this.currentMap.instance.editNode()
  }

  /**
     * Deselect the current node.
     */
  public deselectNode () {
    this.currentMap.instance.deselectNode()
  }

  /**
     * Update a property of the current selected node.
     */
  public updateNode (property: string, value?: any, graphic?: boolean, notifyWithEvent?: boolean, id?: string) {
    this.currentMap.instance.updateNode(property, value, graphic, notifyWithEvent, id)
  }

  /**
     * Remove the node with the id passed as parameter or, if the id is
     * not defined, the current selected node.
     */
  public removeNode (nodeId?: string, notifyWithEvent = true) {
    this.currentMap.instance.removeNode(nodeId, notifyWithEvent)
  }

  /**
     * Copy a node with his children in the mmp clipboard.
     * If id is not specified, copy the selected node.
     */
  public copyNode (nodeId?: string) {
    this.currentMap.instance.copyNode(nodeId)
  }

  /**
     * Remove and copy a node with his children in the mmp clipboard.
     * If id is not specified, copy the selected node.
     */
  public cutNode (nodeId?: string) {
    this.currentMap.instance.cutNode(nodeId)
  }

  /**
     * Paste the node of the mmp clipboard in the map. If id is not specified,
     * paste the nodes of the mmp clipboard in the selected node.
     */
  public pasteNode (nodeId?: string) {
    this.currentMap.instance.pasteNode(nodeId)
  }

  /**
     * Return the children of the current node.
     */
  public nodeChildren (): ExportNodeProperties[] {
    return this.currentMap.instance.nodeChildren()
  }

  /**
     * Move the node in a direction.
     */
  public moveNodeTo (direction: 'left' | 'right' | 'up' | 'down', range = 10) {
    const coordinates = this.currentMap.instance.selectNode().coordinates

    switch (direction) {
      case 'left':
        coordinates.x -= range
        break
      case 'right':
        coordinates.x += range
        break
      case 'up':
        coordinates.y -= range
        break
      case 'down':
        coordinates.y += range
        break
    }

    this.currentMap.instance.updateNode('coordinates', coordinates)
  }

  /**
     * Export the current mind map with the format passed as parameter.
     */
  public async exportMap (format = 'json') {
    const name = this.getRootNode().name
      .replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(/<[^>]*>?/gm, '')

    switch (format) {
      case 'json': {
        const json = JSON.stringify(this.exportAsJSON())
        const uri = `data:text/json;charset=utf-8,${encodeURIComponent(json)}`

        UtilsService.downloadFile(`${name}.${format}`, uri)

        break
      }
      case 'pdf': {
        const imageUri = await this.exportAsImage('png')
        const htmlImageElement = await UtilsService.imageFromUri(imageUri)
        const pdf = new jsPDF({
          orientation: htmlImageElement.width > htmlImageElement.height ? 'l' : 'p',
          unit: 'pt',
          format: 'A4'
        })
        const pdfWidth: number = pdf.internal.pageSize.getWidth()
        const pdfHeight: number = pdf.internal.pageSize.getHeight()

        const scaleFactorWidth: number = pdfWidth / htmlImageElement.width
        const scaleFactorHeight: number = pdfHeight / htmlImageElement.height

        if (pdfWidth > htmlImageElement.width && pdfHeight > htmlImageElement.height) {
          // 0.75 to convert px to pt
          pdf.addImage(imageUri, 0, 0, htmlImageElement.width * 0.75, htmlImageElement.height * 0.75, '', 'NONE', 0)
        } else if (scaleFactorWidth < scaleFactorHeight) {
          pdf.addImage(imageUri, 0, 0, htmlImageElement.width * scaleFactorWidth, htmlImageElement.height * scaleFactorWidth, '', 'NONE', 0)
        } else {
          pdf.addImage(imageUri, 0, 0, htmlImageElement.width * scaleFactorHeight, htmlImageElement.height * scaleFactorHeight, '', 'NONE', 0)
        }

        pdf.save(`${name}.${format}`)

        break
      }
      case 'svg':
      case 'jpeg':
      case 'png': {
        const image = await this.exportAsImage(format)

        UtilsService.downloadFile(`${name}.${format === 'jpeg' ? 'jpg' : format}`, image)

        break
      }
    }
  }

  /**
     * Import an existing map from the local file system.
     */
  public importMap (json: string) {
    this.new(JSON.parse(json))
  }

  /**
     * Insert an image in the selected node.
     */
  public addNodeImage (image: string) {
    this.updateNode('imageSrc', image)
  }

  /**
     * Removes an image of the selected node.
     */
  public removeNodeImage () {
    this.updateNode('imageSrc', '')
  }

  /**
     * Set the current mind mmp.
     */
  public setCurrentMap (id: string): void {
    this.currentMap = this.maps.get(id)
  }

  /**
     * Get the current mind mmp.
     */
  public getCurrentMap (): MmpMap {
    return this.currentMap
  }

  /**
     * Returns the current selected Node
     */
  public exportSelectedNode (): ExportNodeProperties {
    return this.currentMap.instance.exportSelectedNode()
  }

  /**
   * Reverse the last one change of the mind mmp.
   */
  public undo () {
    this.currentMap.instance.undo()
  }

  /**
   * Repeat a previously undoed change of the mind mmp.
   */
  public redo () {
    this.currentMap.instance.redo()
  }
}
