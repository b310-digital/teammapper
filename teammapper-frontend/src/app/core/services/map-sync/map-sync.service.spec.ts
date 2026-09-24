import { TestBed } from '@angular/core/testing';
import { MapSyncService } from './map-sync.service';
import { MmpService } from '../mmp/mmp.service';
import { HttpService } from '../../http/http.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { createMockUtilsService } from '../../../../test/mocks/utils-service.mock';
import { Observable } from 'rxjs';
import { ExportNodeProperties, UserSettings } from '@teammapper/shared';
import { YjsSyncService } from './yjs-sync.service';
import { ImageHandlers, ImageUploadError } from '../mmp/node-images';

// Narrow accessor: only exposes the sync service handle, not its internals
function getSync(service: MapSyncService): YjsSyncService {
  return (service as unknown as { syncService: YjsSyncService }).syncService;
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
    locked: false,
    hidden: false,
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
      selectNode: jest.fn(),
      getRootNode: jest.fn(),
      on: jest.fn(),
      updateNode: jest.fn(),
      updateAdditionalMapOptions: jest.fn(),
      existNode: jest.fn().mockReturnValue(true),
      addNodesFromServer: jest.fn(),
      removeNode: jest.fn(),
      highlightNode: jest.fn(),
      exportAsJSON: jest.fn().mockReturnValue([]),
      registerImageHandlers: jest.fn(),
    } as unknown as jest.Mocked<MmpService>;
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
      postForm: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    settingsService = {
      getCachedUserSettings: jest.fn(),
      getCachedSystemSettings: jest.fn().mockReturnValue({
        featureFlags: { pictograms: false, ai: false },
      }),
      setEditMode: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    const subscribeMock = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
    mmpService.on.mockReturnValue({
      subscribe: subscribeMock,
    } as unknown as Observable<unknown>);

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
          },
        },
      ],
    });

    service = TestBed.inject(MapSyncService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('map initialization', () => {
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

      jest
        .spyOn(getSync(service), 'initMap')
        .mockImplementation(() => undefined);
    });

    it('loads map data into mmpService on initMap', () => {
      service.initMap();

      expect(mmpService.new).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'node-1',
          name: 'Test Node',
        }),
      ]);
    });

    it('selects root node on initMap', () => {
      const rootNode = createMockNode({
        id: 'root',
        name: 'Root',
        isRoot: true,
      });
      mmpService.getRootNode.mockReturnValue(rootNode);
      mmpService.selectNode.mockReturnValue(rootNode);

      service.initMap();

      expect(mmpService.selectNode).toHaveBeenCalledWith('root');
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

    it('appends secret param to HTTP request when secret is set', async () => {
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerMap, writable: true }),
      } as unknown as Response);

      await service.prepareExistingMap('test-uuid', 'my-secret');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('?secret=my-secret')
      );
    });

    it('omits secret param when modification secret is empty', async () => {
      httpService.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerMap, writable: true }),
      } as unknown as Response);

      await service.prepareExistingMap('test-uuid', '');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.anything(),
        '/maps/test-uuid'
      );
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
    const REFERENCE = 'image:3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b';

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
        'api/maps/map-uuid/images/3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b'
      );
    });

    it('resolves nothing while no map is open', () => {
      expect(handlers().resolveUrl(REFERENCE)).toBeNull();
    });

    it('posts the file with the secret in the Authorization header', async () => {
      await openMap('secret');
      httpService.postForm.mockResolvedValueOnce(
        uploadResponse(201, { reference: REFERENCE })
      );

      const reference = await handlers().upload(new Blob(['x']));

      expect(reference).toBe(REFERENCE);
      const [, endpoint, form, headers] = httpService.postForm.mock.calls[0];
      expect(endpoint).toBe('/maps/map-uuid/images');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(headers).toEqual({ Authorization: 'secret' });
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
