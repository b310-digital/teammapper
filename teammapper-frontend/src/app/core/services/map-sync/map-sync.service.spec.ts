import { TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { MapSyncService, SYNCING_TOAST_DELAY_MS } from './map-sync.service';
import { MmpService } from '../mmp/mmp.service';
import { HttpService } from '../../http/http.service';
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
import type { MapData, MmpMap } from '@teammapper/mmp';
import { YjsSyncService } from './yjs-sync.service';
import { MapSyncContext } from './map-sync-context';
import { ImageHandlers, ImageUploadError } from '../mmp/node-images';

const SYNCING_TOAST_ID = 7;

// MmpService is mocked, so a created map only has to be passed through.
const CREATED_MAP = { id: 'created' } as unknown as MmpMap;

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
  let httpService: jest.Mocked<HttpService>;

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
      existNode: jest.fn().mockReturnValue(true),
      removeNode: jest.fn(),
      highlightNode: jest.fn(),
      exportAsJSON: jest.fn().mockReturnValue([]),
      registerImageHandlers: jest.fn(),
    } as unknown as jest.Mocked<MmpService>;
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
      postForm: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    settingsService = {
      getCachedUserSettings: jest.fn(),
      getCachedSystemSettings: jest.fn().mockReturnValue({
        featureFlags: { pictograms: false, ai: false },
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
        { provide: HttpService, useValue: httpService },
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
    const options = { drag: true };
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
        service.openMap(ref, options);
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
        service.openMap(ref, options);
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
          'map_1',
          ref,
          options,
          data
        );
        expect(created < attached && attached < marked).toBe(true);
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
        const lateMap = { id: 'late' } as unknown as MmpMap;
        let finishLate: (map: MmpMap) => void = () => undefined;
        mmpService.create.mockReturnValueOnce(
          new Promise<MmpMap>(resolve => (finishLate = resolve))
        );
        getSyncContext(service).createMap(data);
        service.reset();
        service.openMap(ref, options);
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
      service.openMap(ref, options);

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

  describe('deleteMap', () => {
    it('sends the admin id for the given map', async () => {
      httpService.delete.mockResolvedValueOnce({ ok: true } as Response);

      expect(await service.deleteMap('map-1', 'admin-1')).toBe(true);
      expect(httpService.delete).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/map-1',
        JSON.stringify({ adminId: 'admin-1' })
      );
    });

    it('resolves to false on an error status', async () => {
      httpService.delete.mockResolvedValueOnce({ ok: false } as Response);

      expect(await service.deleteMap('map-1', 'admin-1')).toBe(false);
    });

    it('resolves to false when the request fails', async () => {
      httpService.delete.mockRejectedValueOnce(new TypeError('offline'));

      expect(await service.deleteMap('map-1', 'admin-1')).toBe(false);
    });
  });

  describe('prepareExistingMap', () => {
    let httpService: jest.Mocked<HttpService>;

    const mockServerMap = {
      uuid: 'test-uuid',
      lastModified: '2026-01-01',
      deletedAt: '2026-02-01',
      deleteAfterDays: 30,
      data: [createMockNode({ id: 'root', isRoot: true })],
      options: { fontMaxSize: 18, fontMinSize: 10, fontIncrement: 2 },
      createdAt: '2026-01-01',
    };

    beforeEach(() => {
      httpService = TestBed.inject(HttpService) as jest.Mocked<HttpService>;
    });

    it('sends the secret in X-Map-Modification-Secret and keeps the URL bare', async () => {
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerMap, writable: true }),
      } as unknown as Response);

      await service.prepareExistingMap('test-uuid', 'my-secret');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/test-uuid',
        { 'x-map-modification-secret': 'my-secret' }
      );
    });

    it('omits the secret header when modification secret is empty', async () => {
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerMap, writable: true }),
      } as unknown as Response);

      await service.prepareExistingMap('test-uuid', '');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/test-uuid',
        {}
      );
    });

    describe('with a secret the browser cannot send', () => {
      beforeEach(async () => {
        httpService.get.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ...mockServerMap, writable: false }),
        } as unknown as Response);

        await service.prepareExistingMap('test-uuid', 'geheim-ä)');
      });

      it('omits the secret header', () => {
        expect(httpService.get).toHaveBeenCalledWith(
          expect.anything(),
          '/maps/test-uuid',
          {}
        );
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
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerMap, writable: true }),
      } as unknown as Response);

      await service.prepareExistingMap('test-uuid', 'my-secret');

      expect(TestBed.inject(ToastrService).warning).not.toHaveBeenCalled();
    });

    it('sets writable true on sync service when response writable is true', async () => {
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerMap, writable: true }),
      } as unknown as Response);
      const setWritableSpy = jest.spyOn(getSync(service), 'setWritable');

      await service.prepareExistingMap('test-uuid', 'secret');

      expect(setWritableSpy).toHaveBeenCalledWith(true);
    });

    it('sets writable false on sync service when response writable is false', async () => {
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerMap, writable: false }),
      } as unknown as Response);
      const setWritableSpy = jest.spyOn(getSync(service), 'setWritable');

      await service.prepareExistingMap('test-uuid', 'wrong');

      expect(setWritableSpy).toHaveBeenCalledWith(false);
    });

    it('defaults to writable true when response writable is undefined', async () => {
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockServerMap),
      } as unknown as Response);
      const setWritableSpy = jest.spyOn(getSync(service), 'setWritable');

      await service.prepareExistingMap('test-uuid', '');

      expect(setWritableSpy).toHaveBeenCalledWith(true);
    });
  });

  describe('node images', () => {
    const REFERENCE = 'image:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

    const handlers = (): ImageHandlers =>
      mmpService.registerImageHandlers.mock.calls[0][0];

    const openMap = async (secret: string) => {
      // A failed fetch still stores the secret the page was opened with.
      httpService.get.mockResolvedValueOnce({ ok: false } as Response);
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

    const uploadResponse = (status: number, body: unknown): Response =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      }) as unknown as Response;

    it('resolves a reference to the image endpoint of the open map', async () => {
      await openMap('secret');

      expect(handlers().resolveUrl(REFERENCE)).toBe(
        'api/maps/map-uuid/images/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
      );
    });

    it('resolves nothing while no map is open', () => {
      expect(handlers().resolveUrl(REFERENCE)).toBeNull();
    });

    it('posts the file with the secret in X-Map-Modification-Secret', async () => {
      await openMap('secret');
      httpService.postForm.mockResolvedValueOnce(
        uploadResponse(201, { reference: REFERENCE })
      );

      const reference = await handlers().upload(new Blob(['x']));

      expect(reference).toBe(REFERENCE);
      const [, endpoint, form, headers] = httpService.postForm.mock.calls[0];
      expect(endpoint).toBe('/maps/map-uuid/images');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(headers).toEqual({ 'x-map-modification-secret': 'secret' });
    });

    it('throws the status of a rejected upload', async () => {
      await openMap('secret');
      httpService.postForm.mockResolvedValueOnce(uploadResponse(413, {}));

      await expect(handlers().upload(new Blob(['x']))).rejects.toEqual(
        new ImageUploadError(413)
      );
    });

    it('rejects a response that carries no reference', async () => {
      await openMap('secret');
      httpService.postForm.mockResolvedValueOnce(
        uploadResponse(201, { reference: 'https://example.com/a.png' })
      );

      await expect(handlers().upload(new Blob(['x']))).rejects.toBeInstanceOf(
        ImageUploadError
      );
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
});
