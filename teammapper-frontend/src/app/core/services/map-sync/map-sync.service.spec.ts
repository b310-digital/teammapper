import { TestBed } from '@angular/core/testing';
import { MapSyncService } from './map-sync.service';
import { MmpService } from '../mmp/mmp.service';
import { HttpService } from '../../http/http.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { ToastService } from '../toast/toast.service';
import { DialogService } from '../dialog/dialog.service';
import { ExportNodeProperties } from '@mmp/map/types';
import { createMockUtilsService } from '../../../../test/mocks/utils-service.mock';
import { Observable } from 'rxjs';
import { UserSettings } from '../../../shared/models/settings.model';
import { SyncStrategy } from './sync-strategy';

// Narrow accessor: only exposes the SyncStrategy interface, not sub-service internals
function getStrategy(service: MapSyncService): SyncStrategy {
  return (service as unknown as { syncStrategy: SyncStrategy }).syncStrategy;
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
        featureFlags: { yjs: false, pictograms: false, ai: false },
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
          provide: ToastService,
          useValue: { showValidationCorrection: jest.fn() },
        },
        {
          provide: DialogService,
          useValue: { openCriticalErrorDialog: jest.fn() },
        },
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

      // Prevent strategy from performing real I/O
      jest
        .spyOn(getStrategy(service), 'initMap')
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
    it('undo delegates through to mmpService', () => {
      service.undo();

      expect(mmpService.undo).toHaveBeenCalled();
    });

    it('redo delegates through to mmpService', () => {
      service.redo();

      expect(mmpService.redo).toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('ngOnDestroy calls destroy on strategy', () => {
      const destroySpy = jest.spyOn(getStrategy(service), 'destroy');

      service.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
    });

    it('reset calls detach on strategy', () => {
      const detachSpy = jest.spyOn(getStrategy(service), 'detach');

      service.reset();

      expect(detachSpy).toHaveBeenCalled();
    });
  });
});
