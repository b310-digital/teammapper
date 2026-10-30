import { Injectable, OnDestroy, inject } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CachedAdminMapValue,
  CachedMap,
  CachedMapEntry,
  CachedMapOptions,
  ExportNodeProperties,
  findMainRoot,
  ImageReference,
  normalizeMapData,
} from '@teammapper/shared';
import { ImageUploadError } from '../mmp/node-images';
import type { MapData, MmpInstance } from '@teammapper/mmp';
import { PrivateServerMap, ServerMap } from './server-types';
import { MAP_STORE } from '../map-backend/map-store';
import { MAP_CONNECTION_FACTORY } from '../map-backend/map-connection';
import { COLORS } from '../mmp/mmp-utils';
import { UtilsService } from '../utils/utils.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { ActiveToast, ToastrService } from 'ngx-toastr';
import {
  ClientColorMapping,
  ClientListEntry,
  toTransmittableSecret,
} from './yjs-utils';
import { MapSyncContext, ConnectionStatus } from './map-sync-context';
import { YjsSyncService } from './yjs-sync.service';

/** How long the connection may take to sync before the toast says so. */
export const SYNCING_TOAST_DELAY_MS = 500;

/** The element openMap creates the map in. */
interface MapTarget {
  ref: HTMLElement;
}

/**
 * Loads the attached map from the injected `MapStore` and opens it, with
 * `YjsSyncService` keeping it in sync over a connection from the injected
 * factory. Opening a map runs in this order:
 * 1. `openMap` calls `YjsSyncService.initMap`, which creates the Y.Doc and
 *    its `YjsMapData` and connects. No map exists yet.
 * 2. On the first sync, `YjsSyncService` hands the `YjsMapData` back
 *    through the context's `createMap`, and this service creates mmp over it.
 * 3. This service then calls `YjsSyncService.attachMap`, which wires
 *    listeners, presence and undo, and sets edit mode last.
 */
@Injectable({
  providedIn: 'root',
})
export class MapSyncService implements OnDestroy {
  private mmpService = inject(MmpService);
  private mapStore = inject(MAP_STORE);
  private connectionFactory = inject(MAP_CONNECTION_FACTORY);
  private storageService = inject(StorageService);
  private settingsService = inject(SettingsService);
  private utilsService = inject(UtilsService);
  private toastrService = inject(ToastrService);

  // needed in color panel to show all clients
  private readonly clientListSubject: BehaviorSubject<ClientListEntry[]>;
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

  // Where openMap creates the map once the connection syncs.
  private mapTarget: MapTarget | null = null;
  private syncingToastTimer: ReturnType<typeof setTimeout> | null = null;
  private syncingToast: ActiveToast<unknown> | null = null;

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
    this.clientListSubject = new BehaviorSubject<ClientListEntry[]>([]);

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
      this.connectionFactory
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
    const privateServerMap: PrivateServerMap = await this.createMapInStore();
    this.storePrivateMapData(privateServerMap);
    this.setupNewMapState(privateServerMap);
    return privateServerMap;
  }

  public async prepareExistingMap(
    id: string,
    modificationSecret: string | null
  ): Promise<ServerMap | null> {
    await this.applyModificationSecret(modificationSecret);
    const serverMap = await this.mapStore.getMap(id, this.modificationSecret);

    if (!serverMap) {
      return null;
    }

    this.syncService.setWritable(serverMap.writable !== false);
    this.updateCachedMapForAdmin(serverMap);
    this.prepareMap(serverMap);
    return serverMap;
  }

  public reset() {
    this.mapTarget = null;
    this.removeSyncingToast();
    this.syncService.destroy();
    this.colorMapping = {};
    this.attachedNodeSubject.next(null);
    this.clientListSubject.next([]);
    this.attachedMapSubject.next(null);
  }

  /**
   * Open the connection to the attached map. The map appears in `ref` once
   * the connection syncs; until then the map area stays empty, and a toast
   * tells the user after a short delay that the map is loading.
   */
  public openMap(ref: HTMLElement) {
    this.mapTarget = { ref };
    this.scheduleSyncingToast();
    this.syncService.initMap(this.getAttachedMap().cachedMap.uuid);
  }

  public attachMap(cachedMapEntry: CachedMapEntry): void {
    this.attachedMapSubject.next(cachedMapEntry);
  }

  public getAttachedMapObservable(): Observable<CachedMapEntry | null> {
    return this.attachedMapSubject.asObservable();
  }

  public getClientListObservable(): Observable<ClientListEntry[]> {
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

  /**
   * Apply the map settings to the open map and write the result, with the
   * defaults MmpService filled in, to the Y.Doc for the peers. The Y.Doc
   * observer skips local writes, so MmpService learns of the change here.
   */
  public updateMapOptions(options: CachedMapOptions) {
    this.mmpService.updateAdditionalMapOptions(options);
    const applied = this.mmpService.getAdditionalMapOptions();
    if (applied) this.syncService.updateMapOptions(applied);
  }

  // ─── Context factory ─────────────────────────────────────────

  private createContext(): MapSyncContext {
    return {
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
      createMap: (data: MapData) =>
        void this.createMap(data).catch((error: unknown) => {
          console.error('Failed to create the map:', error);
          this.removeSyncingToast();
        }),
      removeMap: () => this.mmpService.remove(),
      mapDeleted: () => this.removeSyncingToast(),
    };
  }

  // ─── Map creation ────────────────────────────────────────────

  /**
   * Create the map over the synced map data with the user settings cached
   * now, which a sync reset may meet after the settings dialog changed them.
   * With no cached settings mmp falls back to its own defaults. The sync
   * service wires the map up and sets edit mode last, so the map exists
   * when edit mode reaches it. A reset while mmp builds the map leaves
   * nothing to wire up, so the call removes the map it built and keeps a map
   * that a newer `openMap` built.
   */
  private async createMap(data: MapData): Promise<void> {
    const target = this.mapTarget;
    if (!target) return;
    this.removeSyncingToast();

    const options = this.settingsService.getCachedUserSettings()?.mapOptions;
    const map = await this.mmpService.create(target.ref, options, data);
    if (map) this.adoptMap(map, target);
  }

  /**
   * Wire up the map, or remove it when a reset or a newer openMap ran while
   * mmp built it.
   */
  private adoptMap(map: MmpInstance, target: MapTarget): void {
    if (this.mapTarget !== target) return this.mmpService.remove(map);
    this.syncService.attachMap();
    this.mmpService.markMapCreated();
  }

  /**
   * Show the syncing toast when the connection has not synced after the
   * delay. The delay keeps the toast from flashing on a fast connection.
   */
  private scheduleSyncingToast(): void {
    this.removeSyncingToast();
    const timer = setTimeout(
      () => void this.showSyncingToast(timer),
      SYNCING_TOAST_DELAY_MS
    );
    this.syncingToastTimer = timer;
  }

  /** The toast stays until the sync, a reset or a map deletion removes it. */
  private async showSyncingToast(
    timer: ReturnType<typeof setTimeout>
  ): Promise<void> {
    const message = await this.utilsService.translate('TOASTS.MAP_SYNCING');
    // The sync or a reset may have come while the translation loaded.
    if (this.syncingToastTimer !== timer) return;
    this.syncingToast = this.toastrService.info(message, '', {
      disableTimeOut: true,
      tapToDismiss: false,
    });
  }

  private removeSyncingToast(): void {
    if (this.syncingToastTimer !== null) clearTimeout(this.syncingToastTimer);
    this.syncingToastTimer = null;
    if (this.syncingToast) this.toastrService.remove(this.syncingToast.toastId);
    this.syncingToast = null;
  }

  // ─── Node images ─────────────────────────────────────────────

  private attachedMapId(): string | null {
    return this.attachedMapSubject.getValue()?.cachedMap.uuid ?? null;
  }

  /** The address of an image of the open map. */
  private imageUrl(reference: ImageReference): string | null {
    const mapId = this.attachedMapId();
    if (!mapId) return null;
    return this.mapStore.imageUrl(mapId, reference);
  }

  /**
   * Stores the secret from the URL fragment, or an empty string when the
   * browser cannot send it. A dropped secret opens the map read-only, so a
   * toast tells the user that the edit link is invalid.
   */
  private async applyModificationSecret(secret: string | null): Promise<void> {
    this.modificationSecret = toTransmittableSecret(secret);
    if (!secret || this.modificationSecret) return;
    const msg = await this.utilsService.translate(
      'TOASTS.INVALID_MODIFICATION_SECRET'
    );
    if (msg) this.toastrService.warning(msg);
  }

  /** Stores the image with the open map, using the map's secret. */
  private async uploadImage(image: Blob): Promise<ImageReference> {
    const mapId = this.attachedMapId();
    if (!mapId) throw new ImageUploadError(0);
    return this.mapStore.uploadImage(mapId, image, this.modificationSecret);
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

  /** One entry per client, keyed by its awareness id. */
  private extractClientListForSubscriber(): void {
    this.clientListSubject.next(
      Object.entries(this.colorMapping).map(
        ([clientId, { color, displayName, isSelf }]) => ({
          clientId,
          color,
          displayName,
          isSelf,
        })
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
    this.modificationSecret = privateServerMap.modificationSecret;
  }

  private async createMapInStore(): Promise<PrivateServerMap> {
    // The create endpoint requires a root node, so an absent one is a 400 and
    // not a server-side default. Settings init leaves the cache empty when it
    // cannot reach the server, so read the defaults back before posting.
    const cached = this.settingsService.getCachedUserSettings();
    const rootNode =
      cached?.mapOptions.rootNode ??
      (await this.settingsService.getDefaultSettings()).userSettings.mapOptions
        .rootNode;

    return this.mapStore.createMap(rootNode);
  }

  private createKey(uuid: string): string {
    return `map-${uuid}`;
  }

  private convertServerMapToMmp(serverMap: ServerMap): CachedMap {
    return Object.assign({}, serverMap, {
      lastModified: Date.parse(serverMap.lastModified),
      deletedAt:
        serverMap.deletedAt === null ? null : Date.parse(serverMap.deletedAt),
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
        data: normalized.data,
      },
    });
  }

  private async updateCachedMapForAdmin(serverMap: ServerMap) {
    const map: CachedAdminMapValue | null = (await this.storageService.get(
      serverMap.uuid
    )) as CachedAdminMapValue | null;
    if (map) {
      map.ttl =
        serverMap.deletedAt === null ? null : new Date(serverMap.deletedAt);
      map.rootName =
        findMainRoot(serverMap.data)?.name ?? serverMap.data[0]?.name ?? null;
      this.storageService.set(serverMap.uuid, map);
    }
  }
}
