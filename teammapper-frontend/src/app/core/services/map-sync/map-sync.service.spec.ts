import { TestBed } from '@angular/core/testing';
import { MapSyncService } from './map-sync.service';
import { MmpService } from '../mmp/mmp.service';
import { HttpService } from '../../http/http.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { ExportNodeProperties } from '@mmp/map/types';
import { createMockUtilsService } from '../../../../test/mocks/utils-service.mock';
import { Observable } from 'rxjs';
import { UserSettings } from '../../../shared/models/settings.model';
import { YjsSyncService } from './yjs-sync.service';

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
    detached: false,
    ...overrides,
  };
}

describe('MapSyncService', () => {
  let service: MapSyncService;
  let mmpService: jest.Mocked<MmpService>;
  let settingsService: jest.Mocked<SettingsService>;

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
      undo: jest.fn(),
      redo: jest.fn(),
      history: jest.fn().mockReturnValue({ snapshots: [], index: 0 }),
    } as unknown as jest.Mocked<MmpService>;

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
        {
          provide: HttpService,
          useValue: { get: jest.fn(), post: jest.fn() },
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

      expect(mmpService.new).toHaveBeenCalledWith(mockMapSnapshot);
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
