import { Injectable, OnDestroy, inject } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CachedAdminMapEntry,
  CachedAdminMapValue,
  CachedMap,
  CachedMapEntry,
  CachedMapOptions,
} from '../../../shared/models/cached-map.model';
import { ExportNodeProperties, MapProperties } from '@mmp/map/types';
import { PrivateServerMap, ServerMap, ServerMapInfo } from './server-types';
import { API_URL, HttpService } from '../../http/http.service';
import { COLORS } from '../mmp/mmp-utils';
import { UtilsService } from '../utils/utils.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { ToastService } from '../toast/toast.service';
import { DialogService } from '../dialog/dialog.service';
import { ClientColorMapping, ClientColorMappingValue } from './yjs-utils';
import { MapSyncErrorHandler } from './map-sync-error-handler';
import { MapSyncContext, ConnectionStatus } from './map-sync-context';
import { SocketIoSyncService } from './socket-io-sync.service';
import { YjsSyncService } from './yjs-sync.service';

export { ConnectionStatus } from './map-sync-context';

@Injectable({
  providedIn: 'root',
})
export class MapSyncService implements OnDestroy {
  private mmpService = inject(MmpService);
  private httpService = inject(HttpService);
  private storageService = inject(StorageService);
  private settingsService = inject(SettingsService);
  private utilsService = inject(UtilsService);
  private toastrService = inject(ToastrService);
  private toastService = inject(ToastService);
  private dialogService = inject(DialogService);

  // needed in color panel to show all clients
  private readonly clientListSubject: BehaviorSubject<string[]>;
  // needed in map component to initialize when map is rendered and data present
  private readonly attachedMapSubject: BehaviorSubject<CachedMapEntry | null>;
  // needed in the application component for UI related tasks
  private readonly attachedNodeSubject: BehaviorSubject<ExportNodeProperties | null>;
  // inform other parts of the app about the connection state
  private readonly connectionStatusSubject: BehaviorSubject<ConnectionStatus>;
  // Yjs undo/redo state
  private readonly canUndoSubject = new BehaviorSubject<boolean>(false);
  private readonly canRedoSubject = new BehaviorSubject<boolean>(false);
  public readonly canUndo$: Observable<boolean> =
    this.canUndoSubject.asObservable();
  public readonly canRedo$: Observable<boolean> =
    this.canRedoSubject.asObservable();

  // Sub-services
  private readonly socketIoSync: SocketIoSyncService;
  private readonly yjsSync: YjsSyncService;
  private readonly errorHandler: MapSyncErrorHandler;

  // Common fields
  private colorMapping: ClientColorMapping;
  private availableColors: string[];
  private clientColor: string;
  private modificationSecret: string;
  private readonly yjsEnabled: boolean;

  constructor() {
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
    this.yjsEnabled =
      this.settingsService.getCachedSystemSettings()?.featureFlags?.yjs ??
      false;

    this.errorHandler = new MapSyncErrorHandler(
      this.mmpService,
      this.utilsService,
      this.toastService,
      this.dialogService
    );

    const ctx = this.createContext();

    this.socketIoSync = new SocketIoSyncService(
      ctx,
      this.mmpService,
      this.settingsService,
      this.utilsService,
      this.toastrService,
      this.errorHandler
    );

    this.yjsSync = new YjsSyncService(
      ctx,
      this.mmpService,
      this.settingsService,
      this.utilsService,
      this.toastrService,
      this.httpService
    );

    if (!this.yjsEnabled) {
      this.socketIoSync.initConnection();
    }
  }

  ngOnDestroy() {
    if (this.yjsEnabled) {
      this.yjsSync.reset();
    } else {
      this.socketIoSync.reset();
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  public async prepareNewMap(): Promise<PrivateServerMap> {
    const privateServerMap: PrivateServerMap = await this.postMapToServer();
    this.storePrivateMapData(privateServerMap);
    this.setupNewMapState(privateServerMap);
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

  public reset() {
    if (this.yjsEnabled) {
      this.yjsSync.detachObservers();
      this.yjsSync.unsubscribeListeners();
    } else {
      this.socketIoSync.reset();
    }
    this.colorMapping = {};
  }

  public initMap() {
    this.mmpService.new(this.getAttachedMap().cachedMap.data);
    this.attachedNodeSubject.next(
      this.mmpService.selectNode(this.mmpService.getRootNode().id)
    );

    if (this.yjsEnabled) {
      this.yjsSync.init();
    } else {
      this.socketIoSync.createListeners();
      this.socketIoSync.listenServerEvents(
        this.getAttachedMap().cachedMap.uuid
      );
    }
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

  public async updateAttachedMap(): Promise<void> {
    const cachedMapEntry: CachedMapEntry = this.getAttachedMap();

    const cachedMap: CachedMap = {
      data: this.mmpService.exportAsJSON(),
      lastModified: Date.now(),
      createdAt: cachedMapEntry.cachedMap.createdAt,
      uuid: cachedMapEntry.cachedMap.uuid,
      deletedAt: cachedMapEntry.cachedMap.deletedAt,
      deleteAfterDays: cachedMapEntry.cachedMap.deleteAfterDays,
      options: cachedMapEntry.cachedMap.options,
    };

    this.attachMap({ key: cachedMapEntry.key, cachedMap });
  }

  public undo(): void {
    this.yjsSync.undo();
  }

  public redo(): void {
    this.yjsSync.redo();
  }

  public updateMapOptions(options?: CachedMapOptions) {
    if (this.yjsEnabled) {
      this.yjsSync.writeMapOptions(options);
    } else {
      this.socketIoSync.emitUpdateMapOptions(options);
    }
  }

  public async deleteMap(adminId: string): Promise<void> {
    if (this.yjsEnabled) {
      await this.yjsSync.deleteMap(adminId);
    } else {
      this.socketIoSync.deleteMap(adminId);
    }
  }

  public async fetchUserMapsFromServer(): Promise<CachedAdminMapEntry[]> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps');
    if (!response.ok) return [];
    const json: ServerMapInfo[] = await response.json();
    return json.map(map => ({
      id: map.uuid,
      cachedAdminMapValue: {
        adminId: map.adminId,
        modificationSecret: map.modificationSecret,
        ttl: map.ttl ? new Date(map.ttl) : new Date(),
        rootName: map.rootName,
      },
    }));
  }

  // ─── Context factory ─────────────────────────────────────────

  private createContext(): MapSyncContext {
    return {
      getAttachedMap: () => this.getAttachedMap(),
      getModificationSecret: () => this.modificationSecret,
      getColorMapping: () => this.colorMapping,
      getClientColor: () => this.clientColor,
      colorForNode: (nodeId: string) => this.colorForNode(nodeId),
      setConnectionStatus: (status: ConnectionStatus) =>
        this.connectionStatusSubject.next(status),
      setColorMapping: (mapping: ClientColorMapping) => {
        this.colorMapping = mapping;
      },
      setAttachedNode: (node: ExportNodeProperties | null) =>
        this.attachedNodeSubject.next(node),
      setClientColor: (color: string) => {
        this.clientColor = color;
      },
      setCanUndo: (v: boolean) => this.canUndoSubject.next(v),
      setCanRedo: (v: boolean) => this.canRedoSubject.next(v),
      updateAttachedMap: () => this.updateAttachedMap(),
      emitClientList: () => this.extractClientListForSubscriber(),
    };
  }

  // ─── Shared utilities ────────────────────────────────────────

  private colorForNode(nodeId: string): string {
    const matchingClient = this.clientForNode(nodeId);
    return matchingClient ? this.colorMapping[matchingClient].color : '';
  }

  private clientForNode(nodeId: string): string {
    return Object.keys(this.colorMapping)
      .filter((key: string) => this.colorMapping[key]?.nodeId === nodeId)
      .shift();
  }

  private extractClientListForSubscriber(): void {
    this.clientListSubject.next(
      Object.values(this.colorMapping).map(
        (e: ClientColorMappingValue) => e?.color
      )
    );
  }

  private storePrivateMapData(privateServerMap: PrivateServerMap): void {
    const serverMap = privateServerMap.map;
    this.storageService.set(serverMap.uuid, {
      adminId: privateServerMap.adminId,
      modificationSecret: privateServerMap.modificationSecret,
      ttl: serverMap.deletedAt,
      rootName: serverMap.data[0].name,
      createdAt: serverMap.createdAt,
    });
  }

  private setupNewMapState(privateServerMap: PrivateServerMap): void {
    this.prepareMap(privateServerMap.map);
    this.settingsService.setEditMode(true);
    this.modificationSecret = privateServerMap.modificationSecret;
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
        rootNode:
          this.settingsService.getCachedUserSettings().mapOptions.rootNode,
      })
    );

    return response.json();
  }

  private createKey(uuid: string): string {
    return `map-${uuid}`;
  }

  private convertServerMapToMmp(serverMap: ServerMap): MapProperties {
    return Object.assign({}, serverMap, {
      lastModified: Date.parse(serverMap.lastModified),
      deletedAt: Date.parse(serverMap.deletedAt),
      createdAt: Date.parse(serverMap.createdAt),
    });
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
}
