import { Injectable, OnDestroy } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CachedAdminMapValue,
  CachedMap,
  CachedMapEntry,
  CachedMapOptions,
} from '../../../shared/models/cached-map.model';
import { io, Socket } from 'socket.io-client';
import { NodePropertyMapping } from '@mmp/index';
import {
  ExportNodeProperties,
  MapCreateEvent,
  MapProperties,
  NodeUpdateEvent,
} from '@mmp/map/types';
import {
  PrivateServerMap,
  ResponseMapOptionsUpdated,
  ResponseMapUpdated,
  ResponseNodeRemoved,
  ResponseNodeUpdated,
  ResponseNodesAdded,
  ResponseSelectionUpdated,
  ServerMap,
} from './server-types';
import { API_URL, HttpService } from '../../http/http.service';
import { COLORS } from '../mmp/mmp-utils';
import { UtilsService } from '../utils/utils.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';

const DEFAULT_COLOR = '#000000';
const DEFAULT_SELF_COLOR = '#c0c0c0';

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

export type ConnectionStatus = 'connected' | 'disconnected' | null;

@Injectable({
  providedIn: 'root',
})
export class MapSyncService implements OnDestroy {
  // needed in color panel to show all clients
  private readonly clientListSubject: BehaviorSubject<string[]>;
  // needed in map component to initialize when map is rendered and data present
  private readonly attachedMapSubject: BehaviorSubject<CachedMapEntry | null>;
  // needed in the application component for UI related tasks
  private readonly attachedNodeSubject: BehaviorSubject<ExportNodeProperties | null>;
  // inform other parts of the app about the connection state
  private readonly connectionStatusSubject: BehaviorSubject<ConnectionStatus>;

  private socket: Socket;
  private colorMapping: ClientColorMapping;
  private availableColors: string[];
  private clientColor: string;
  private modificationSecret: string;

  constructor(
    private mmpService: MmpService,
    private httpService: HttpService,
    private storageService: StorageService,
    private settingsService: SettingsService
  ) {
    // Initialization of the behavior subjects.
    this.attachedMapSubject = new BehaviorSubject<CachedMapEntry | null>(null);
    this.attachedNodeSubject = new BehaviorSubject<ExportNodeProperties | null>(
      null
    );
    this.connectionStatusSubject = new BehaviorSubject<ConnectionStatus>(null);

    this.clientListSubject = new BehaviorSubject<string[]>([]);
    this.availableColors = COLORS;
    this.clientColor =
      this.availableColors[
        Math.floor(Math.random() * this.availableColors.length)
      ];
    this.modificationSecret = '';
    this.colorMapping = {};
    this.socket = io();
  }

  ngOnDestroy() {
    this.reset();
  }

  public async prepareNewMap(): Promise<PrivateServerMap> {
    const privateServerMap: PrivateServerMap = await this.postMapToServer();
    const serverMap = privateServerMap.map;
    // store private map data locally
    this.storageService.set(serverMap.uuid, {
      adminId: privateServerMap.adminId,
      modificationSecret: privateServerMap.modificationSecret,
      ttl: serverMap.deletedAt,
      rootName: serverMap.data[0].name,
    });

    this.prepareMap(serverMap);

    this.settingsService.setEditMode(true);
    this.modificationSecret = privateServerMap.modificationSecret;
    return privateServerMap;
  }

  public async prepareExistingMap(
    id: string,
    modificationSecret: string
  ): Promise<ServerMap> {
    this.modificationSecret = modificationSecret;
    const serverMap = await this.fetchMapFromServer(id);

    if (!serverMap) {
      return;
    }

    this.updateCachedMapForAdmin(serverMap);
    this.prepareMap(serverMap);

    return serverMap;
  }

  // In case the component is destroyed or will be reinitialized it is important to reset state
  // that might cause problems or performance issues, e.g. removing listeners, cleanup state.
  // The current map is used inside the settings component and should stay therefore as it was.
  public reset() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.leaveMap();
    }
    this.colorMapping = {};
  }

  public initMap() {
    this.mmpService.new(this.getAttachedMap().cachedMap.data);
    this.attachedNodeSubject.next(
      this.mmpService.selectNode(this.mmpService.getRootNode().id)
    );

    this.createMapListeners();
    this.listenServerEvents(this.getAttachedMap().cachedMap.uuid);
  }

  public attachMap(cachedMapEntry: CachedMapEntry): void {
    this.attachedMapSubject.next(cachedMapEntry);
  }

  public getAttachedMapObservable(): Observable<CachedMapEntry | null> {
    return this.attachedMapSubject.asObservable();
  }

  public getClientListObservable(): Observable<string[] | null> {
    return this.clientListSubject.asObservable();
  }

  public getAttachedNodeObservable(): Observable<ExportNodeProperties | null> {
    return this.attachedNodeSubject.asObservable();
  }

  public getConnectionStatusObservable(): Observable<ConnectionStatus> {
    return this.connectionStatusSubject.asObservable();
  }

  public getAttachedMap(): CachedMapEntry {
    return this.attachedMapSubject.getValue();
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatusSubject.getValue();
  }

  private setConnectionStatusSubject(value: ConnectionStatus) {
    this.connectionStatusSubject.next(value);
  }

  // update the attached map from outside control flow
  public async updateAttachedMap(): Promise<void> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();

    const cachedMap: CachedMap = {
      data: this.mmpService.exportAsJSON(),
      lastModified: Date.now(),
      uuid: cachedMapEntry.cachedMap.uuid,
      deletedAt: cachedMapEntry.cachedMap.deletedAt,
      deleteAfterDays: cachedMapEntry.cachedMap.deleteAfterDays,
      options: cachedMapEntry.cachedMap.options,
    };

    this.attachMap({ key: cachedMapEntry.key, cachedMap });
  }

  public async joinMap(mmpUuid: string, color: string): Promise<MapProperties> {
    console.log("Joining: ", mmpUuid)
    return await new Promise<MapProperties>(
      (resolve: (reason: any) => void, reject: (reason: any) => void) => {
        this.socket.emit(
          'join',
          { mapId: mmpUuid, color },
          (serverMap: MapProperties) => {
            if (!serverMap) {
              reject('Server Map not available');
              return;
            }
            resolve(serverMap);
          }
        );
      }
    );
  }

  public leaveMap() {
    this.socket.emit('leave');
  }

  public addNode(newNode: ExportNodeProperties) {
    this.socket.emit('addNodes', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      nodes: [newNode],
      modificationSecret: this.modificationSecret,
    });
  }

  public addNodes(newNodes: ExportNodeProperties[]) {
    this.socket.emit('addNodes', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      nodes: newNodes,
      modificationSecret: this.modificationSecret,
    });
  }

  public updateNode(nodeUpdate: NodeUpdateEvent) {
    this.socket.emit('updateNode', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      node: nodeUpdate.nodeProperties,
      updatedProperty: nodeUpdate.changedProperty,
      modificationSecret: this.modificationSecret,
    });
  }

  public removeNode(removedNode: ExportNodeProperties) {
    this.socket.emit('removeNode', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      node: removedNode,
      modificationSecret: this.modificationSecret,
    });
  }

  public updateMap() {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('updateMap', {
      mapId: cachedMapEntry.cachedMap.uuid,
      map: cachedMapEntry.cachedMap,
      modificationSecret: this.modificationSecret,
    });
  }

  public updateMapOptions(options?: CachedMapOptions) {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    this.socket.emit('updateMapOptions', {
      mapId: cachedMapEntry.cachedMap.uuid,
      options,
      modificationSecret: this.modificationSecret,
    });
  }

  public async deleteMap(adminId: string): Promise<any> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();
    const body: { adminId: string; mapId: string } = {
      adminId,
      mapId: cachedMapEntry.cachedMap.uuid,
    };
    return this.socket.emit('deleteMap', body);
  }

  public async updateNodeSelection(id: string, selected: boolean) {
    // Remember all clients selections with the dedicated colors to switch between colors when clients change among nodes
    if (selected) {
      this.colorMapping[this.socket.id] = {
        color: DEFAULT_SELF_COLOR,
        nodeId: id,
      };
    } else {
      this.colorMapping[this.socket.id] = {
        color: DEFAULT_SELF_COLOR,
        nodeId: '',
      };
      const colorForNode: string = this.colorForNode(id);
      if (colorForNode !== '')
        this.mmpService.highlightNode(id, colorForNode, false);
    }

    this.socket.emit('updateNodeSelection', {
      mapId: this.getAttachedMap().cachedMap.uuid,
      nodeId: id,
      selected,
    });
  }

  private checkModificationSecret() {
    this.socket.emit(
      'checkModificationSecret',
      {
        mapId: this.getAttachedMap().cachedMap.uuid,
        modificationSecret: this.modificationSecret,
      },
      (result: boolean) => this.settingsService.setEditMode(result)
    );
  }

  private async fetchMapFromServer(id: string): Promise<ServerMap> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps/' + id);
    if (!response.ok) return null;
    const json: ServerMap = await response.json();
    return json;
  }

  private async postMapToServer(): Promise<PrivateServerMap> {
    const response = await this.httpService.post(
      API_URL.ROOT,
      '/maps/',
      JSON.stringify({
        rootNode: this.settingsService.getCachedSettings().mapOptions.rootNode,
      })
    );
    console.log("Posted to server: ", response)
    return response.json();
  }

  /**
   * Return the key of the map in the storage
   */
  private createKey(uuid: string): string {
    return `map-${uuid}`;
  }

  /**
   * Converts server map
   */
  private convertServerMapToMmp(serverMap: ServerMap): MapProperties {
    return Object.assign({}, serverMap, {
      lastModified: Date.parse(serverMap.lastModified),
      deletedAt: Date.parse(serverMap.deletedAt),
    });
  }

  private listenServerEvents(uuid: string): Promise<MapProperties> {
    this.checkModificationSecret();

    this.socket.io.on('reconnect', async () => {
      const serverMap: MapProperties = await this.joinMap(
        uuid,
        this.clientColor
      );

      this.setConnectionStatusSubject('connected');
      this.mmpService.new(serverMap.data, false);
    });

    this.socket.on('nodesAdded', (result: ResponseNodesAdded) => {
      if (result.clientId === this.socket.id) return;

      result.nodes.forEach(node => {
        if (!this.mmpService.existNode(node?.id)) {
          this.mmpService.addNodeFromServer(node);
        }
      });
    });

    this.socket.on('nodeUpdated', (result: ResponseNodeUpdated) => {
      if (result.clientId === this.socket.id) return;

      const newNode = result.node;
      const existingNode = this.mmpService.getNode(newNode.id);
      const propertyPath = NodePropertyMapping[result.property];
      const changedValue = UtilsService.get(newNode, propertyPath);
      this.mmpService.updateNode(
        result.property,
        changedValue,
        false,
        existingNode.id
      );
    });

    this.socket.on('mapUpdated', (result: ResponseMapUpdated) => {
      if (result.clientId === this.socket.id) return;

      this.mmpService.new(result.map.data, false);
    });

    this.socket.on('mapOptionsUpdated', (result: ResponseMapOptionsUpdated) => {
      if (result.clientId === this.socket.id) return;

      this.mmpService.updateAdditionalMapOptions(result.options);
    });

    this.socket.on('nodeRemoved', (result: ResponseNodeRemoved) => {
      if (result.clientId === this.socket.id) return;

      const removedNodeId = result.nodeId;
      if (this.mmpService.existNode(removedNodeId)) {
        this.mmpService.removeNode(removedNodeId, false);
      }
    });

    this.socket.on('selectionUpdated', (result: ResponseSelectionUpdated) => {
      if (result.clientId === this.socket.id) return;
      if (!this.mmpService.existNode(result.nodeId)) return;

      if (!this.colorMapping[result.clientId]) {
        this.colorMapping[result.clientId] = {
          color: DEFAULT_COLOR,
          nodeId: '',
        };
        this.extractClientListForSubscriber();
      }

      if (result.selected) {
        this.colorMapping[result.clientId].nodeId = result.nodeId;
      } else {
        this.colorMapping[result.clientId].nodeId = '';
      }
      const colorForNode: string = this.colorForNode(result.nodeId);
      this.mmpService.highlightNode(result.nodeId, colorForNode, false);
    });

    this.socket.on('clientListUpdated', (clients: ServerClientList) => {
      this.colorMapping = Object.keys(clients).reduce<ClientColorMapping>(
        (acc: ClientColorMapping, key: string) => {
          acc[key] = {
            nodeId: this.colorMapping[key]?.nodeId || '',
            color: key === this.socket.id ? DEFAULT_SELF_COLOR : clients[key],
          };
          return acc;
        },
        {}
      );
      this.extractClientListForSubscriber();
    });

    this.socket.on('clientDisconnect', (clientId: string) => {
      delete this.colorMapping[clientId];
      this.extractClientListForSubscriber();
    });

    this.socket.on('disconnect', () => {
      this.setConnectionStatusSubject('disconnected');
    });

    this.socket.on('mapDeleted', () => {
      window.location.reload();
    });

    return this.joinMap(uuid, this.clientColor);
  }

  private colorForNode(nodeId: string): string {
    const matchingClient = this.clientForNode(nodeId);
    return matchingClient ? this.colorMapping[matchingClient].color : '';
  }

  private clientForNode(nodeId: string): string {
    return Object.keys(this.colorMapping)
      .filter((key: string) => {
        return this.colorMapping[key]?.nodeId === nodeId;
      })
      .shift();
  }

  private extractClientListForSubscriber(): void {
    this.clientListSubject.next(
      Object.values(this.colorMapping).map(
        (e: ClientColorMappingValue) => e?.color
      )
    );
  }

  private prepareMap(serverMap: ServerMap) {
    const mapKey = this.createKey(serverMap.uuid);
    const mapProps = this.convertServerMapToMmp(serverMap);
    this.attachMap({
      key: mapKey,
      cachedMap: { ...mapProps, ...{ options: serverMap.options } },
    });
    this.mmpService.updateAdditionalMapOptions(serverMap.options);
  }

  private async updateCachedMapForAdmin(serverMap: ServerMap) {
    const map: CachedAdminMapValue | null = (await this.storageService.get(
      serverMap.uuid
    )) as CachedAdminMapValue | null;
    if (map) {
      map.ttl = new Date(serverMap.deletedAt);
      map.rootName = serverMap.data?.[0]?.name;
      this.storageService.set(serverMap.uuid, map);
    }
  }

  private createMapListeners() {
    // create is NOT called by the mmp lib for initial map load / and call, but for _imported_ maps
    this.mmpService.on('create').subscribe((_result: MapCreateEvent) => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());

      this.updateAttachedMap();
      this.updateMap();
    });

    this.mmpService
      .on('nodeSelect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelection(nodeProps.id, true);
        this.attachedNodeSubject.next(nodeProps);
      });

    this.mmpService
      .on('nodeDeselect')
      .subscribe((nodeProps: ExportNodeProperties) => {
        this.updateNodeSelection(nodeProps.id, false);
        this.attachedNodeSubject.next(nodeProps);
      });

    this.mmpService.on('nodeUpdate').subscribe((result: NodeUpdateEvent) => {
      this.attachedNodeSubject.next(result.nodeProperties);
      this.updateNode(result);
      this.updateAttachedMap();
    });

    this.mmpService.on('undo').subscribe(() => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      this.updateAttachedMap();
      this.updateMap();
    });

    this.mmpService.on('redo').subscribe(() => {
      this.attachedNodeSubject.next(this.mmpService.selectNode());
      this.updateAttachedMap();
      this.updateMap();
    });

    this.mmpService
      .on('nodeCreate')
      .subscribe((newNode: ExportNodeProperties) => {
        this.addNode(newNode);
        this.updateAttachedMap();
        this.mmpService.selectNode(newNode.id);
        this.mmpService.editNode();
      });

    this.mmpService
      .on('nodePaste')
      .subscribe((newNodes: ExportNodeProperties[]) => {
        this.addNodes(newNodes);
        this.updateAttachedMap();
      });

    this.mmpService
      .on('nodeRemove')
      .subscribe((removedNode: ExportNodeProperties) => {
        this.removeNode(removedNode);
        this.updateAttachedMap();
      });
  }
}
