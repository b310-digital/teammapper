import { TestBed } from '@angular/core/testing';
import { NEVER, Observable } from 'rxjs';
import { MapSyncService, SYNCING_TOAST_DELAY_MS } from './map-sync.service';
import { MmpService } from '../mmp/mmp.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { createMockUtilsService } from '../../../../test/mocks/utils-service.mock';
import {
  CachedMapEntry,
  ExportNodeProperties,
  UserSettings,
} from '@teammapper/shared';
import type { MapData, MmpInstance } from '@teammapper/mmp';
import { YjsSyncService } from './yjs-sync.service';
import { MapSyncContext } from './map-sync-context';
import { ClientColorMapping, ClientListEntry } from './yjs-utils';
import { ImageHandlers, ImageUploadError } from '../mmp/node-images';
import { MAP_STORE, MapStore } from '../map-backend/map-store';
import { MAP_CONNECTION_FACTORY } from '../map-backend/map-connection';
import { FakeMapConnections } from '../../../../test/mocks/map-connection.mock';
import { ServerMap } from './server-types';

const SYNCING_TOAST_ID = 7;

// MmpService is mocked, so a created map only has to be passed through.
const CREATED_MAP = { id: 'created' } as unknown as MmpInstance;

// Narrow accessor: only exposes the sync service handle, not its internals
function getSync(service: MapSyncService): YjsSyncService {
  return (service as unknown as { syncService: YjsSyncService }).syncService;
}

// The context the Yjs connection reads its subprotocol secret from
function getSyncContext(service: MapSyncService): MapSyncContext {
  return (getSync(service) as unknown as { ctx: MapSyncContext }).ctx;
}

function createMockNode(
  overrides?: Partial<ExportNodeProperties>
): ExportNodeProperties {
  return {
    id: 'mock-id',
    name: 'Mock Node',
    parent: 'root',
    k: 1,
    colors: { branch: '#000000' },
    font: { size: 14, style: 'normal', weight: 'normal' },
    protected: false,
    coordinates: undefined,
    image: undefined,
    link: undefined,
    isRoot: false,
    ...overrides,
  };
}

describe('MapSyncService', () => {
  let service: MapSyncService;
  let mmpService: jest.Mocked<MmpService>;
  let settingsService: jest.Mocked<SettingsService>;
  let mapStore: jest.Mocked<MapStore>;

  const mockNode = createMockNode({ id: 'node-1', name: 'Test Node' });
  const mockMapSnapshot: ExportNodeProperties[] = [mockNode];

  beforeEach(() => {
    mmpService = {
      new: jest.fn(),
      create: jest.fn().mockResolvedValue(CREATED_MAP),
      remove: jest.fn(),
      markMapCreated: jest.fn(),
      selectNode: jest.fn(),
      getRootNode: jest.fn(),
      on: jest.fn(),
      updateNode: jest.fn(),
      updateAdditionalMapOptions: jest.fn(),
      getAdditionalMapOptions: jest.fn().mockReturnValue(null),
      existNode: jest.fn().mockReturnValue(true),
      removeNode: jest.fn(),
      highlightNode: jest.fn(),
      exportAsJSON: jest.fn().mockReturnValue([]),
      registerImageHandlers: jest.fn(),
    } as unknown as jest.Mocked<MmpService>;
    mapStore = {
      createMap: jest.fn(),
      getMap: jest.fn(),
      listMaps: jest.fn(),
      deleteMap: jest.fn(),
      uploadImage: jest.fn(),
      imageUrl: jest.fn(),
      preloadImages: jest.fn(),
      releaseImages: jest.fn(),
    };

    settingsService = {
      getCachedUserSettings: jest.fn(),
      getCachedSystemSettings: jest.fn().mockReturnValue({
        featureFlags: { pictograms: false, ai: false, arrows: false },
      }),
      setEditMode: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    mmpService.on.mockReturnValue(NEVER);

    mmpService.getRootNode.mockReturnValue(
      createMockNode({ id: 'root', name: 'Root', isRoot: true })
    );
    mmpService.selectNode.mockReturnValue(mockNode);
    settingsService.getCachedUserSettings.mockReturnValue({
      mapOptions: { rootNode: 'Root' },
    } as unknown as UserSettings);

    TestBed.configureTestingModule({
      providers: [
        MapSyncService,
        { provide: MmpService, useValue: mmpService },
        { provide: MAP_STORE, useValue: mapStore },
        {
          provide: MAP_CONNECTION_FACTORY,
          useValue: new FakeMapConnections().factory,
        },
        {
          provide: StorageService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        { provide: SettingsService, useValue: settingsService },
        { provide: UtilsService, useValue: createMockUtilsService() },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn(),
            success: jest.fn(),
            warning: jest.fn(),
            info: jest.fn().mockReturnValue({ toastId: SYNCING_TOAST_ID }),
            remove: jest.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(MapSyncService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('opening a map', () => {
    const ref = document.createElement('div');
    const data = {} as MapData;

    beforeEach(() => {
      jest.spyOn(service, 'getAttachedMap').mockReturnValue({
        key: 'map-test-uuid',
        cachedMap: {
          uuid: 'test-uuid',
          data: mockMapSnapshot,
          lastModified: Date.now(),
          createdAt: Date.now(),
          deletedAt: Date.now() + 86400000,
          deleteAfterDays: 30,
          options: { fontMaxSize: 18, fontMinSize: 10, fontIncrement: 2 },
        },
      });
    });

    describe('before the first sync', () => {
      beforeEach(() => {
        jest
          .spyOn(getSync(service), 'initMap')
          .mockImplementation(() => undefined);
        service.openMap(ref);
      });

      it('opens the connection to the attached map', () => {
        expect(getSync(service).initMap).toHaveBeenCalledWith('test-uuid');
      });

      it('creates no map and loads no snapshot from the server', () => {
        expect(mmpService.create).not.toHaveBeenCalled();
        expect(mmpService.new).not.toHaveBeenCalled();
      });
    });

    describe('on the first sync', () => {
      beforeEach(() => {
        jest
          .spyOn(getSync(service), 'initMap')
          .mockImplementation(() => undefined);
        jest
          .spyOn(getSync(service), 'attachMap')
          .mockImplementation(() => undefined);
        service.openMap(ref);
      });

      const sync = async () => {
        getSyncContext(service).createMap(data);
        await new Promise(resolve => setTimeout(resolve));
      };

      it('creates the map over the map data, wires it up, then marks it created', async () => {
        await sync();

        const created = mmpService.create.mock.invocationCallOrder[0];
        const attached = (getSync(service).attachMap as jest.Mock).mock
          .invocationCallOrder[0];
        const marked = mmpService.markMapCreated.mock.invocationCallOrder[0];
        expect(mmpService.create).toHaveBeenCalledWith(
          ref,
          { rootNode: 'Root' },
          data
        );
        expect(created < attached && attached < marked).toBe(true);
      });

      // A sync reset builds the map again, after the settings dialog may have
      // changed the user settings.
      it('creates the map with the user settings cached when it syncs', async () => {
        const mapOptions = { showLinktext: true };
        settingsService.getCachedUserSettings.mockReturnValue({
          mapOptions,
        } as unknown as UserSettings);

        await sync();

        expect(mmpService.create).toHaveBeenCalledWith(ref, mapOptions, data);
      });

      it('removes the map a reset left behind while mmp built it', async () => {
        getSyncContext(service).createMap(data);
        service.reset();
        await new Promise(resolve => setTimeout(resolve));

        expect(mmpService.remove).toHaveBeenCalledWith(CREATED_MAP);
        expect(getSync(service).attachMap).not.toHaveBeenCalled();
        expect(mmpService.markMapCreated).not.toHaveBeenCalled();
      });

      it('removes only the late map when a newer open built its map first', async () => {
        const lateMap = { id: 'late' } as unknown as MmpInstance;
        let finishLate: (map: MmpInstance) => void = () => undefined;
        mmpService.create.mockReturnValueOnce(
          new Promise<MmpInstance>(resolve => (finishLate = resolve))
        );
        getSyncContext(service).createMap(data);
        service.reset();
        service.openMap(ref);
        await sync();

        finishLate(lateMap);
        await new Promise(resolve => setTimeout(resolve));

        expect(mmpService.remove).toHaveBeenCalledTimes(1);
        expect(mmpService.remove).toHaveBeenCalledWith(lateMap);
        expect(getSync(service).attachMap).toHaveBeenCalledTimes(1);
        expect(mmpService.markMapCreated).toHaveBeenCalledTimes(1);
      });

      it('wires nothing up when mmp created no map', async () => {
        mmpService.create.mockResolvedValueOnce(null);

        await sync();

        expect(mmpService.remove).not.toHaveBeenCalled();
        expect(getSync(service).attachMap).not.toHaveBeenCalled();
        expect(mmpService.markMapCreated).not.toHaveBeenCalled();
      });

      it('logs a failed create and wires nothing up', async () => {
        const error = new Error('create failed');
        mmpService.create.mockRejectedValueOnce(error);
        const log = jest.spyOn(console, 'error').mockImplementation(() => {
          return undefined;
        });

        await sync();

        expect(log).toHaveBeenCalledWith('Failed to create the map:', error);
        expect(getSync(service).attachMap).not.toHaveBeenCalled();
        expect(mmpService.markMapCreated).not.toHaveBeenCalled();
        log.mockRestore();
      });
    });

    it('attaches the node and the awareness selection the map made on create', async () => {
      const rootNode = createMockNode({
        id: 'root',
        name: 'Root',
        isRoot: true,
      });
      mmpService.selectNode.mockReturnValue(rootNode);
      const attached: (ExportNodeProperties | null)[] = [];
      service
        .getAttachedNodeObservable()
        .subscribe(node => attached.push(node));
      service.openMap(ref);

      getSyncContext(service).createMap(data);
      await new Promise(resolve => setTimeout(resolve));

      const sync = getSync(service) as unknown as { selectedNodeId: string };
      expect(attached[attached.length - 1]).toBe(rootNode);
      expect(sync.selectedNodeId).toBe('root');
      expect(mmpService.selectNode.mock.invocationCallOrder[0]).toBeGreaterThan(
        mmpService.create.mock.invocationCallOrder[0]
      );
    });
  });

  describe('syncing toast', () => {
    const toastr = () =>
      TestBed.inject(ToastrService) as unknown as {
        info: jest.Mock;
        remove: jest.Mock;
      };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(getSync(service), 'initMap').mockImplementation(() => {
        return undefined;
      });
      jest
        .spyOn(getSync(service), 'attachMap')
        .mockImplementation(() => undefined);
      jest.spyOn(service, 'getAttachedMap').mockReturnValue({
        key: 'map-test-uuid',
        cachedMap: { uuid: 'test-uuid' },
      } as CachedMapEntry);
      service.openMap(document.createElement('div'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows no toast before 500 ms pass', async () => {
      await jest.advanceTimersByTimeAsync(SYNCING_TOAST_DELAY_MS - 1);

      expect(toastr().info).not.toHaveBeenCalled();
    });

    it('shows a lasting toast when the connection has not synced after 500 ms', async () => {
      await jest.advanceTimersByTimeAsync(SYNCING_TOAST_DELAY_MS);

      expect(toastr().info).toHaveBeenCalledWith('TOASTS.MAP_SYNCING', '', {
        disableTimeOut: true,
        tapToDismiss: false,
      });
    });

    it('shows no toast when the connection synced in time', async () => {
      getSyncContext(service).createMap({} as MapData);
      await jest.advanceTimersByTimeAsync(SYNCING_TOAST_DELAY_MS);

      expect(toastr().info).not.toHaveBeenCalled();
    });

    it('removes the toast on the first sync', async () => {
      await jest.advanceTimersByTimeAsync(SYNCING_TOAST_DELAY_MS);

      getSyncContext(service).createMap({} as MapData);

      expect(toastr().remove).toHaveBeenCalledWith(SYNCING_TOAST_ID);
    });

    it('removes the toast on reset', async () => {
      await jest.advanceTimersByTimeAsync(SYNCING_TOAST_DELAY_MS);

      service.reset();

      expect(toastr().remove).toHaveBeenCalledWith(SYNCING_TOAST_ID);
    });

    it('removes the toast when the server deletes the map', async () => {
      await jest.advanceTimersByTimeAsync(SYNCING_TOAST_DELAY_MS);

      getSyncContext(service).mapDeleted();

      expect(toastr().remove).toHaveBeenCalledWith(SYNCING_TOAST_ID);
    });
  });

  describe('client list', () => {
    function emitted(mapping: ClientColorMapping): ClientListEntry[] {
      let list: ClientListEntry[] = [];
      const subscription = service
        .getClientListObservable()
        .subscribe(entries => (list = entries));
      getSyncContext(service).setColorMapping(mapping);
      getSyncContext(service).emitClientList();
      subscription.unsubscribe();
      return list;
    }

    it('emits one entry per client with its id, color, name and whether it is the own client', () => {
      const list = emitted({
        '1': { color: '#c0c0c0', nodeId: '', displayName: 'Me', isSelf: true },
        '7': {
          color: '#0000ff',
          nodeId: 'n',
          displayName: 'Vorname Test',
          isSelf: false,
        },
      });

      expect(list).toEqual([
        { clientId: '1', color: '#c0c0c0', displayName: 'Me', isSelf: true },
        {
          clientId: '7',
          color: '#0000ff',
          displayName: 'Vorname Test',
          isSelf: false,
        },
      ]);
    });
  });

  describe('undo and redo', () => {
    it('undo delegates through to sync service', () => {
      const undoSpy = jest.spyOn(getSync(service), 'undo');

      service.undo();

      expect(undoSpy).toHaveBeenCalled();
    });

    it('redo delegates through to sync service', () => {
      const redoSpy = jest.spyOn(getSync(service), 'redo');

      service.redo();

      expect(redoSpy).toHaveBeenCalled();
    });
  });

  describe('prepareNewMap', () => {
    it('creates the map with the cached root node and stores its admin data', async () => {
      mapStore.createMap.mockResolvedValueOnce({
        map: {
          uuid: 'new-uuid',
          lastModified: '2026-01-01',
          deletedAt: null,
          deleteAfterDays: null,
          data: [createMockNode({ id: 'root', name: 'Root', isRoot: true })],
          options: {},
          createdAt: '2026-01-01',
        } as unknown as ServerMap,
        adminId: 'admin-1',
        modificationSecret: 'secret-1',
      });

      await service.prepareNewMap();

      expect(mapStore.createMap).toHaveBeenCalledWith('Root');
      expect(TestBed.inject(StorageService).set).toHaveBeenCalledWith(
        'new-uuid',
        expect.objectContaining({
          adminId: 'admin-1',
          modificationSecret: 'secret-1',
        })
      );
      expect(getSyncContext(service).getModificationSecret()).toBe('secret-1');
    });
  });

  describe('prepareExistingMap', () => {
    const mockServerMap = {
      uuid: 'test-uuid',
      lastModified: '2026-01-01',
      deletedAt: '2026-02-01',
      deleteAfterDays: 30,
      data: [createMockNode({ id: 'root', isRoot: true })],
      options: { fontMaxSize: 18, fontMinSize: 10, fontIncrement: 2 },
      createdAt: '2026-01-01',
    } as unknown as ServerMap;

    it('loads the map with the secret', async () => {
      mapStore.getMap.mockResolvedValue({ ...mockServerMap, writable: true });

      await service.prepareExistingMap('test-uuid', 'my-secret');

      expect(mapStore.getMap).toHaveBeenCalledWith('test-uuid', 'my-secret');
    });

    it('loads the map without a secret when modification secret is empty', async () => {
      mapStore.getMap.mockResolvedValue({ ...mockServerMap, writable: true });

      await service.prepareExistingMap('test-uuid', '');

      expect(mapStore.getMap).toHaveBeenCalledWith('test-uuid', '');
    });

    describe('with a secret the browser cannot send', () => {
      beforeEach(async () => {
        mapStore.getMap.mockResolvedValue({
          ...mockServerMap,
          writable: false,
        });

        await service.prepareExistingMap('test-uuid', 'geheim-ä)');
      });

      it('loads the map without the secret', () => {
        expect(mapStore.getMap).toHaveBeenCalledWith('test-uuid', '');
      });

      it('gives the Yjs connection no secret', () => {
        expect(getSyncContext(service).getModificationSecret()).toBe('');
      });

      it('warns that the edit link is invalid', () => {
        expect(TestBed.inject(ToastrService).warning).toHaveBeenCalledWith(
          'TOASTS.INVALID_MODIFICATION_SECRET'
        );
      });
    });

    it('shows no warning for a valid secret', async () => {
      mapStore.getMap.mockResolvedValue({ ...mockServerMap, writable: true });

      await service.prepareExistingMap('test-uuid', 'my-secret');

      expect(TestBed.inject(ToastrService).warning).not.toHaveBeenCalled();
    });

    it('sets writable true on sync service when response writable is true', async () => {
      mapStore.getMap.mockResolvedValue({ ...mockServerMap, writable: true });
      const setWritableSpy = jest.spyOn(getSync(service), 'setWritable');

      await service.prepareExistingMap('test-uuid', 'secret');

      expect(setWritableSpy).toHaveBeenCalledWith(true);
    });

    it('sets writable false on sync service when response writable is false', async () => {
      mapStore.getMap.mockResolvedValue({ ...mockServerMap, writable: false });
      const setWritableSpy = jest.spyOn(getSync(service), 'setWritable');

      await service.prepareExistingMap('test-uuid', 'wrong');

      expect(setWritableSpy).toHaveBeenCalledWith(false);
    });

    it('defaults to writable true when response writable is undefined', async () => {
      mapStore.getMap.mockResolvedValue(mockServerMap);
      const setWritableSpy = jest.spyOn(getSync(service), 'setWritable');

      await service.prepareExistingMap('test-uuid', '');

      expect(setWritableSpy).toHaveBeenCalledWith(true);
    });

    // Attaching the map makes MapComponent open it, and mmp resolves each
    // image reference while it draws the map.
    it('preloads the images of the map before it attaches the map', async () => {
      mapStore.getMap.mockResolvedValue(mockServerMap);
      let attachedWhilePreloading: CachedMapEntry | null = null;
      mapStore.preloadImages.mockImplementation(async () => {
        attachedWhilePreloading = service['attachedMapSubject'].getValue();
      });

      await service.prepareExistingMap('test-uuid', '');

      expect(mapStore.preloadImages).toHaveBeenCalledWith('test-uuid');
      expect(attachedWhilePreloading).toBeNull();
      expect(service.getAttachedMap().cachedMap.uuid).toBe('test-uuid');
    });

    it('preloads no images for an unknown map', async () => {
      mapStore.getMap.mockResolvedValue(null);

      await service.prepareExistingMap('test-uuid', '');

      expect(mapStore.preloadImages).not.toHaveBeenCalled();
    });

    // The Y.Doc holds the stored map settings, and YjsSyncService applies
    // them when the map opens. The REST copy would race the map's creation.
    it('leaves the map settings to the Yjs sync', async () => {
      mapStore.getMap.mockResolvedValue(mockServerMap);

      await service.prepareExistingMap('test-uuid', '');

      expect(mmpService.updateAdditionalMapOptions).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('releases the preloaded images of the closed map', () => {
      service.reset();

      expect(mapStore.releaseImages).toHaveBeenCalled();
    });
  });

  describe('updateMapOptions', () => {
    it('applies the map settings locally and writes the result for the peers', () => {
      const applied = { fontMaxSize: 80, fontMinSize: 12, fontIncrement: 7 };
      mmpService.getAdditionalMapOptions.mockReturnValue(applied);
      const writeSpy = jest
        .spyOn(getSync(service), 'updateMapOptions')
        .mockImplementation(() => undefined);

      service.updateMapOptions({ fontMaxSize: 80, fontIncrement: 7 });

      expect(mmpService.updateAdditionalMapOptions).toHaveBeenCalledWith({
        fontMaxSize: 80,
        fontIncrement: 7,
      });
      expect(writeSpy).toHaveBeenCalledWith(applied);
    });
  });

  describe('node images', () => {
    const REFERENCE = 'image:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

    const handlers = (): ImageHandlers =>
      mmpService.registerImageHandlers.mock.calls[0][0];

    const openMap = async (secret: string) => {
      // A failed fetch still stores the secret the page was opened with.
      mapStore.getMap.mockResolvedValueOnce(null);
      await service.prepareExistingMap('map-uuid', secret);
      service.attachMap({
        key: 'map-map-uuid',
        cachedMap: {
          uuid: 'map-uuid',
          data: [],
          lastModified: 0,
          createdAt: 0,
          deletedAt: 0,
          deleteAfterDays: 30,
          options: {},
        },
      });
    };

    it('resolves a reference through the map store for the open map', async () => {
      await openMap('secret');
      mapStore.imageUrl.mockReturnValueOnce('resolved-url');

      expect(handlers().resolveUrl(REFERENCE)).toBe('resolved-url');
      expect(mapStore.imageUrl).toHaveBeenCalledWith('map-uuid', REFERENCE);
    });

    it('resolves nothing while no map is open', () => {
      expect(handlers().resolveUrl(REFERENCE)).toBeNull();
      expect(mapStore.imageUrl).not.toHaveBeenCalled();
    });

    it('uploads the file to the open map with the secret', async () => {
      await openMap('secret');
      mapStore.uploadImage.mockResolvedValueOnce(REFERENCE);
      const image = new Blob(['x']);

      const reference = await handlers().upload(image);

      expect(reference).toBe(REFERENCE);
      expect(mapStore.uploadImage).toHaveBeenCalledWith(
        'map-uuid',
        image,
        'secret'
      );
    });

    it('passes the error of a rejected upload on', async () => {
      await openMap('secret');
      mapStore.uploadImage.mockRejectedValueOnce(new ImageUploadError(413));

      await expect(handlers().upload(new Blob(['x']))).rejects.toEqual(
        new ImageUploadError(413)
      );
    });

    it('rejects an upload while no map is open', async () => {
      await expect(handlers().upload(new Blob(['x']))).rejects.toEqual(
        new ImageUploadError(0)
      );
      expect(mapStore.uploadImage).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('ngOnDestroy calls destroy on sync service', () => {
      const destroySpy = jest.spyOn(getSync(service), 'destroy');

      service.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
    });

    it('reset calls destroy on sync service', () => {
      const destroySpy = jest.spyOn(getSync(service), 'destroy');

      service.reset();

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('removing the map on a server reset', () => {
    it('removes the current map from mmp through the context', () => {
      getSyncContext(service).removeMap();

      expect(mmpService.remove).toHaveBeenCalledTimes(1);
      expect(mmpService.remove).toHaveBeenCalledWith();
    });
  });

  describe('reset', () => {
    const latest = <T>(observable: Observable<T>): T | undefined => {
      let value: T | undefined;
      observable.subscribe(next => (value = next)).unsubscribe();
      return value;
    };

    it('clears the attached node', () => {
      getSyncContext(service).setAttachedNode(mockNode);

      service.reset();

      expect(latest(service.getAttachedNodeObservable())).toBeNull();
    });

    it('clears the client list', () => {
      const context = getSyncContext(service);
      context.setColorMapping({
        client: {
          color: '#ff0000',
          nodeId: 'a',
          displayName: '',
          isSelf: false,
        },
      });
      context.emitClientList();

      service.reset();

      expect(latest(service.getClientListObservable())).toEqual([]);
    });

    it('clears the attached map', () => {
      service.attachMap({
        key: 'map-1',
        cachedMap: { uuid: 'map-1' } as CachedMapEntry['cachedMap'],
      });

      service.reset();

      expect(latest(service.getAttachedMapObservable())).toBeNull();
    });
  });
});
