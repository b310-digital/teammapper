import { Injectable } from '@angular/core'
import { MmpService } from '../mmp/mmp.service'
import { BehaviorSubject } from 'rxjs'
import { CachedMap, CachedMapEntry, CachedMapOptions } from '../../../shared/models/cached-map.model'
import { io, Socket } from 'socket.io-client'
import { NodePropertyMapping } from '@mmp/index'
import { ExportNodeProperties, MapProperties, MapSnapshot, NodeUpdateEvent } from '@mmp/map/types'
import { PrivateServerMap, ResponseMapOptionsUpdated, ResponseMapUpdated, ResponseNodeAdded, ResponseNodeRemoved, ResponseNodeUpdated, ResponseSelectionUpdated, ServerMap } from './server-types'
import { API_URL, HttpService } from '../../http/http.service'
import { DialogService } from '../../../shared/services/dialog/dialog.service'
import { COLORS } from '../mmp/mmp-utils'
import { UtilsService } from '../utils/utils.service'
import { StorageService } from '../storage/storage.service'
import { SettingsService } from '../settings/settings.service'

const DEFAULT_COLOR = '#000000'
const DEFAULT_SELF_COLOR = '#c0c0c0'

interface ClientColorMapping {
  [clientId: string]: ClientColorMappingValue;
}

interface ClientColorMappingValue {
  nodeId: string;
  color: string;
}

interface ServerClientList {
  [clientId: string]: string;
}

@Injectable({
  providedIn: 'root'
})
export class MapSyncService {
  // Observable of behavior subject with the attached map key.
  public clientListChanged: BehaviorSubject<string[]>
  private readonly attachedMapSubject: BehaviorSubject<CachedMapEntry | null>
  private socket: Socket
  private colorMapping: ClientColorMapping
  private availableColors: string[]
  private clientColor: string
  private modificationSecret: string

  constructor (
    private mmpService: MmpService,
    private httpService: HttpService,
    private dialogService: DialogService,
    private storageService: StorageService,
    private settingsService: SettingsService
  ) {
    // Initialization of the behavior subjects.
    this.attachedMapSubject = new BehaviorSubject<CachedMapEntry | null>(null)

    this.colorMapping = {}
    this.clientListChanged = new BehaviorSubject<string[]>([])
    this.availableColors = COLORS
    this.clientColor = this.availableColors[Math.floor(Math.random() * this.availableColors.length)]
    this.modificationSecret = ''
  }

  public async initNewMap (): Promise<PrivateServerMap> {
    const privateServerMap: PrivateServerMap = await this.attachNewMap()
    this.modificationSecret = privateServerMap.modificationSecret
    return privateServerMap
  }

  public async initExistingMap (id: string, modificationSecret: string): Promise<ServerMap> {
    this.modificationSecret = modificationSecret
    const serverMap: ServerMap = await this.attachExistingMap(id)
    return serverMap
  }

  /**
     * Add current new application map to cache and attach it.
     */
  public async attachNewMap (): Promise<PrivateServerMap> {
    const privateServerMap: PrivateServerMap = await this.postMapToServer()
    const serverMap = privateServerMap.map
    const mmpMap: MapProperties = this.convertServerMapToMmp(privateServerMap.map)
    const key = this.createKey(mmpMap.uuid)
    // store private map data locally
    this.storageService.set(mmpMap.uuid, 
      { adminId: privateServerMap.adminId, modificationSecret: privateServerMap.modificationSecret, ttl: mmpMap.deletedAt })

    // initialize mmp with initial map data from server
    this.mmpService.new(serverMap.data)

    const cachedMap: CachedMap = {
      data: serverMap.data,
      lastModified: mmpMap.lastModified,
      uuid: mmpMap.uuid,
      deleteAfterDays: mmpMap.deleteAfterDays,
      deletedAt: mmpMap.deletedAt,
      options: serverMap.options
    }

    // init data and other components from new map data
    this.attachMap({ key, cachedMap })
    this.settingsService.setEditMode(true)
    this.listenServerEvents(mmpMap.uuid)
    this.mmpService.updateAdditionalMapOptions(serverMap.options)

    return privateServerMap
  }

  /**
     * Attach existing map.
     */
  public async attachExistingMap (id: string): Promise<ServerMap> {
    const newServerMap = await this.fetchMapFromServer(id)

    if (!newServerMap) {
      return
    }

    const mapKey = this.createKey(newServerMap.uuid)

    this.attachMap({
      key: mapKey,
      cachedMap: { ...this.convertServerMapToMmp(newServerMap), ...{ options: newServerMap.options } }
    })

    this.mmpService.new(newServerMap.data)

    const mmpUuid = newServerMap.uuid

    // init data and other components from exisitng data
    this.listenServerEvents(mmpUuid)
    this.checkModificationSecret()
    this.initColorMapping()
    this.mmpService.updateAdditionalMapOptions(newServerMap.options)

    return newServerMap
  }

  /**
     * Attach a map.
     */
  public attachMap (cachedMapEntry: CachedMapEntry): void {
    this.attachedMapSubject.next(cachedMapEntry)
  }

  /**
     * Update the attached map.
     */
  public async updateAttachedMap (): Promise<void> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap()

    const cachedMap: CachedMap = {
      data: this.mmpService.exportAsJSON(),
      lastModified: Date.now(),
      uuid: cachedMapEntry.cachedMap.uuid,
      deletedAt: cachedMapEntry.cachedMap.deletedAt,
      deleteAfterDays: cachedMapEntry.cachedMap.deleteAfterDays,
      options: cachedMapEntry.cachedMap.options
    }

    this.attachMap({ key: cachedMapEntry.key, cachedMap })
  }

  public getAttachedMap (): CachedMapEntry {
    return this.attachedMapSubject.getValue()
  }

  // TODO Make additional request to server to check if editing code is valid and it can be edited
  public async fetchMapFromServer (id: string): Promise<ServerMap> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps/' + id)
    if (!response.ok) return null

    const json: ServerMap = await response.json()
    return json
  }

  public async postMapToServer(): Promise<PrivateServerMap> {
    const response = await this.httpService.post(
      API_URL.ROOT, '/maps/',
      JSON.stringify({ rootNode: this.settingsService.getCachedSettings().mapOptions.rootNode })
    )
    return response.json()
  }

  public async joinMap (mmpUuid: string, color: string): Promise<MapProperties> {
    return await new Promise<MapProperties>((resolve: (reason: any) => void, reject: (reason: any) => void) => {
      this.socket.emit('join', { mapId: mmpUuid, color }, (serverMap: MapProperties) => {
        if (!serverMap) {
          reject('Server Map not available')
          return
        }
        resolve(serverMap)
      })
    })
  }

  public leaveMap () {
    this.socket.emit('leave')
  }

  public async addNode (newNode: ExportNodeProperties) {
    this.socket.emit(
      'addNode',
      { 
        mapId: this.getAttachedMap().cachedMap.uuid,
        node: newNode,
        modificationSecret: this.modificationSecret
      }
    )
  }

  public async updateNode (nodeUpdate: NodeUpdateEvent) {
    this.socket.emit(
      'updateNode',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        node: nodeUpdate.nodeProperties,
        updatedProperty: nodeUpdate.changedProperty,
        modificationSecret: this.modificationSecret
      }
    )
  }

  public async removeNode (removedNode: ExportNodeProperties) {
    this.socket.emit(
      'removeNode',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        node: removedNode,
        modificationSecret: this.modificationSecret
      }
    )
  }

  public async updateMap (_oldMapData?: MapSnapshot): Promise<void> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap()
    this.socket.emit(
      'updateMap',
      { 
        mapId: cachedMapEntry.cachedMap.uuid,
        map: cachedMapEntry.cachedMap,
        modificationSecret: this.modificationSecret
      }
    )
  }

  public async updateMapOptions (options?: CachedMapOptions): Promise<void> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap()
    this.socket.emit(
      'updateMapOptions',
      {
        mapId: cachedMapEntry.cachedMap.uuid,
        options,
        modificationSecret: this.modificationSecret
      }
    )
  }

  public async deleteMap (adminId: string): Promise<any> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap()
    const body: {adminId: string; mapId: string} = { adminId, mapId: cachedMapEntry.cachedMap.uuid }
    return await this.socket.emit('deleteMap', body)
  }

  public async updateNodeSelection (id: string, selected: boolean) {
    // Remember all clients selections with the dedicated colors to switch between colors when clients change among nodes
    if (selected) {
      this.colorMapping[this.socket.id] = { color: DEFAULT_SELF_COLOR, nodeId: id }
    } else {
      this.colorMapping[this.socket.id] = { color: DEFAULT_SELF_COLOR, nodeId: '' }
      const colorForNode: string = this.colorForNode(id)
      if (colorForNode !== '') this.mmpService.highlightNode(id, colorForNode, false)
    }

    this.socket.emit('updateNodeSelection', { mapId: this.getAttachedMap().cachedMap.uuid, nodeId: id, selected })
  }

  private async checkModificationSecret () {
    await this.socket.emit(
      'checkModificationSecret',
      { mapId: this.getAttachedMap().cachedMap.uuid, modificationSecret: this.modificationSecret },
      (result: boolean) => this.settingsService.setEditMode(result)
    )
  }

  /**
     * Return the key of the map in the storage
     */
  private createKey (uuid: string): string {
    return `map-${uuid}`
  }

  /**
     * Converts server map
     */
  private convertServerMapToMmp (serverMap: ServerMap): MapProperties {
    return Object.assign({}, serverMap, { lastModified: Date.parse(serverMap.lastModified), deletedAt: Date.parse(serverMap.deletedAt) })
  }

  private listenServerEvents (uuid: string): void {
    this.socket = io()

    this.socket.io.on('reconnect', async () => {
      const serverMap: MapProperties = await this.joinMap(uuid, this.clientColor)

      this.dialogService.closeDisconnectDialog()
      this.mmpService.new(serverMap.data, false)
      this.updateAttachedMap()
    })

    this.socket.on('nodeAdded', (result: ResponseNodeAdded) => {
      if (result.clientId === this.socket.id) return

      if (!this.mmpService.existNode(result?.node?.id)) {
        this.mmpService.addNode(result.node, false)
      }
    })

    this.socket.on('nodeUpdated', (result: ResponseNodeUpdated) => {
      if (result.clientId === this.socket.id) return

      const newNode = result.node
      const existingNode = this.mmpService.getNode(newNode.id)
      const propertyPath = NodePropertyMapping[result.property]
      const changedValue = UtilsService.get(newNode, propertyPath)
      this.mmpService.updateNode(result.property, changedValue, false, false, existingNode.id)
    })

    this.socket.on('mapUpdated', (result: ResponseMapUpdated) => {
      if (result.clientId === this.socket.id) return

      this.mmpService.new(result.map.data, false)
      this.updateAttachedMap()
    })

    this.socket.on('mapOptionsUpdated', (result: ResponseMapOptionsUpdated) => {
      if (result.clientId === this.socket.id) return

      this.mmpService.updateAdditionalMapOptions(result.options)
    })

    this.socket.on('nodeRemoved', (result: ResponseNodeRemoved) => {
      if (result.clientId === this.socket.id) return

      const removedNodeId = result.nodeId
      if (this.mmpService.existNode(removedNodeId)) {
        this.mmpService.removeNode(removedNodeId, false)
      }
    })

    this.socket.on('selectionUpdated', (result: ResponseSelectionUpdated) => {
      if (result.clientId === this.socket.id) return
      if (!this.mmpService.existNode(result.nodeId)) return

      if (!this.colorMapping[result.clientId]) {
        this.colorMapping[result.clientId] = { color: DEFAULT_COLOR, nodeId: '' }
        this.extractClientListForSubscriber()
      }

      if (result.selected) {
        this.colorMapping[result.clientId].nodeId = result.nodeId
      } else {
        this.colorMapping[result.clientId].nodeId = ''
      }
      const colorForNode: string = this.colorForNode(result.nodeId)
      this.mmpService.highlightNode(result.nodeId, colorForNode, false)
    })

    this.socket.on('clientListUpdated', (clients: ServerClientList) => {
      this.colorMapping = Object.keys(clients).reduce<ClientColorMapping>((acc: ClientColorMapping, key: string) => {
        acc[key] = {
          nodeId: this.colorMapping[key]?.nodeId || '',
          color: key === this.socket.id ? DEFAULT_SELF_COLOR : clients[key]
        }
        return acc
      }, {})
      this.extractClientListForSubscriber()
    })

    this.socket.on('clientDisconnect', (clientId: string) => {
      delete this.colorMapping[clientId]
      this.extractClientListForSubscriber()
    })

    this.socket.on('disconnect', () => {
      this.dialogService.openDisconnectDialog()
    })

    this.socket.on('mapDeleted', () => {
      window.location.reload()
    })

    this.joinMap(uuid, this.clientColor)
  }

  private initColorMapping (): void {
    if (!this.socket?.id) return

    this.colorMapping = {
      [this.socket.id]: { nodeId: this.mmpService.exportSelectedNode().id, color: DEFAULT_SELF_COLOR }
    }
    this.extractClientListForSubscriber()
  }

  private colorForNode (nodeId: string): string {
    const matchingClient = this.clientForNode(nodeId)
    return matchingClient ? this.colorMapping[matchingClient].color : ''
  }

  private clientForNode (nodeId: string): string {
    return Object.keys(this.colorMapping).filter((key: string) => {
      return this.colorMapping[key]?.nodeId === nodeId
    }).shift()
  }

  private extractClientListForSubscriber (): void {
    this.clientListChanged.next(Object.values(this.colorMapping).map((e: ClientColorMappingValue) => e?.color))
  }
}
