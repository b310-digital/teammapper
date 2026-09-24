import { Injectable, OnDestroy, inject } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CachedAdminMapEntry,
  CachedAdminMapValue,
  CachedMap,
  CachedMapEntry,
  CachedMapOptions,
  ExportNodeProperties,
  findMainRoot,
  ImageReference,
  imageIdOf,
  normalizeMapData,
  parseImageUploadResponse,
} from '@teammapper/shared';
import { ImageUploadError } from '../mmp/node-images';
import { MapProperties } from '@teammapper/mmp';
import { PrivateServerMap, ServerMap, ServerMapInfo } from './server-types';
import { API_URL, HttpService } from '../../http/http.service';
import { COLORS } from '../mmp/mmp-utils';
import { UtilsService } from '../utils/utils.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { ClientColorMapping, ClientColorMappingValue } from './yjs-utils';
import { MapSyncContext, ConnectionStatus } from './map-sync-context';
import { YjsSyncService } from './yjs-sync.service';

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

  private readonly syncService: YjsSyncService;

  // Common fields
  private colorMapping: ClientColorMapping;
  private availableColors: string[];
  private clientColor: string;
  private modificationSecret: string;

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

    this.syncService = new YjsSyncService(
      this.createContext(),
      this.mmpService,
      this.settingsService,
      this.utilsService,
      this.toastrService,
      this.httpService
    );

    this.mmpService.registerImageHandlers({
      resolveUrl: reference => this.imageUrl(reference),
      upload: image => this.uploadImage(image),
    });
  }

  ngOnDestroy() {
    this.syncService.destroy();
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
    modificationSecret: string | null
  ): Promise<ServerMap | null> {
    this.modificationSecret = modificationSecret ?? '';
    const serverMap = await this.fetchMapFromServer(id);

    if (!serverMap) {
      return null;
    }

    this.syncService.setWritable(serverMap.writable !== false);
    this.updateCachedMapForAdmin(serverMap);
    this.prepareMap(serverMap);
    return serverMap;
  }

  public reset() {
    this.syncService.destroy();
    this.colorMapping = {};
  }

  public initMap() {
    const rawData = this.getAttachedMap().cachedMap.data;
    const normalized = normalizeMapData({ data: rawData });
    this.mmpService.new(normalized.data as unknown as ExportNodeProperties[]);
    this.attachedNodeSubject.next(
      this.mmpService.selectNode(this.mmpService.getRootNode().id)
    );
    this.syncService.initMap(this.getAttachedMap().cachedMap.uuid);
  }

  public attachMap(cachedMapEntry: CachedMapEntry): void {
    this.attachedMapSubject.next(cachedMapEntry);
  }

  public getAttachedMapObservable(): Observable<CachedMapEntry | null> {
    return this.attachedMapSubject.asObservable();
  }

  public getClientListObservable(): Observable<string[]> {
    return this.clientListSubject.asObservable();
  }

  public getAttachedNodeObservable(): Observable<ExportNodeProperties | null> {
    return this.attachedNodeSubject.asObservable();
  }

  public getConnectionStatusObservable(): Observable<ConnectionStatus> {
    return this.connectionStatusSubject.asObservable();
  }

  public getAttachedMap(): CachedMapEntry {
    const attachedMap = this.attachedMapSubject.getValue();

    if (!attachedMap) {
      throw new Error('No map is attached');
    }

    return attachedMap;
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
    this.syncService.undo();
  }

  public redo(): void {
    this.syncService.redo();
  }

  public updateMapOptions(options?: CachedMapOptions) {
    this.syncService.updateMapOptions(options);
  }

  public async deleteMap(adminId: string): Promise<void> {
    await this.syncService.deleteMap(adminId);
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

  // ─── Node images ─────────────────────────────────────────────

  private attachedMapId(): string | null {
    return this.attachedMapSubject.getValue()?.cachedMap.uuid ?? null;
  }

  /** The image endpoint of the open map for a reference. */
  private imageUrl(reference: ImageReference): string | null {
    const mapId = this.attachedMapId();
    if (!mapId) return null;
    return `${API_URL.ROOT}/maps/${mapId}/images/${imageIdOf(reference)}`;
  }

  /**
   * Posts the image to the open map. The secret goes in the Authorization
   * header, which keeps it out of access logs.
   */
  private async uploadImage(image: Blob): Promise<ImageReference> {
    const mapId = this.attachedMapId();
    if (!mapId) throw new ImageUploadError(0);
    const form = new FormData();
    form.append('file', image, 'image');
    const headers: Record<string, string> = this.modificationSecret
      ? { Authorization: this.modificationSecret }
      : {};
    const response = await this.httpService
      .postForm(API_URL.ROOT, `/maps/${mapId}/images`, form, headers)
      .catch(() => null);
    if (!response?.ok) throw new ImageUploadError(response?.status ?? 0);
    return this.referenceFromUploadResponse(response);
  }

  private async referenceFromUploadResponse(
    response: Response
  ): Promise<ImageReference> {
    const body: unknown = await response.json().catch(() => null);
    const reference = parseImageUploadResponse(body);
    if (!reference) throw new ImageUploadError(response.status);
    return reference;
  }

  // ─── Shared utilities ────────────────────────────────────────

  private colorForNode(nodeId: string): string {
    const matchingClient = this.clientForNode(nodeId);
    return matchingClient ? this.colorMapping[matchingClient].color : '';
  }

  private clientForNode(nodeId: string): string | undefined {
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

  private async fetchMapFromServer(id: string): Promise<ServerMap | null> {
    const secretParam = this.modificationSecret
      ? `?secret=${encodeURIComponent(this.modificationSecret)}`
      : '';
    const response = await this.httpService.get(
      API_URL.ROOT,
      '/maps/' + id + secretParam
    );
    if (!response.ok) return null;
    const json: ServerMap = await response.json();
    return json;
  }

  private async postMapToServer(): Promise<PrivateServerMap> {
    // The create endpoint requires a root node, so an absent one is a 400 and
    // not a server-side default. Settings init leaves the cache empty when it
    // cannot reach the server, so read the defaults back before posting.
    const cached = this.settingsService.getCachedUserSettings();
    const rootNode =
      cached?.mapOptions.rootNode ??
      (await this.settingsService.getDefaultSettings()).userSettings.mapOptions
        .rootNode;

    const response = await this.httpService.post(
      API_URL.ROOT,
      '/maps/',
      JSON.stringify({ rootNode })
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
    const normalized = normalizeMapData({
      ...mapProps,
      options: serverMap.options,
    });
    this.attachMap({
      key: mapKey,
      cachedMap: {
        ...mapProps,
        options: serverMap.options,
        data: normalized.data as unknown as ExportNodeProperties[],
      },
    });
    this.mmpService.updateAdditionalMapOptions(serverMap.options);
  }

  private async updateCachedMapForAdmin(serverMap: ServerMap) {
    const map: CachedAdminMapValue | null = (await this.storageService.get(
      serverMap.uuid
    )) as CachedAdminMapValue | null;
    if (map) {
      map.ttl = new Date(serverMap.deletedAt);
      map.rootName =
        findMainRoot(serverMap.data)?.name ?? serverMap.data[0]?.name ?? null;
      this.storageService.set(serverMap.uuid, map);
    }
  }
}
