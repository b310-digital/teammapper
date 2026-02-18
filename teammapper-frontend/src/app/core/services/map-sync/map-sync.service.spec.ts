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
import {
  ValidationErrorResponse,
  CriticalErrorResponse,
  SuccessResponse,
  OperationResponse,
} from './server-types';
import { ExportNodeProperties } from '@mmp/map/types';
import { createMockUtilsService } from '../../../../test/mocks/utils-service.mock';
import { Observable } from 'rxjs';
import { UserSettings } from '../../../shared/models/settings.model';
import { SyncStrategy } from './sync-strategy';

// Access the internal syncStrategy for test setup
interface MapSyncServiceInternal {
  syncStrategy: SyncStrategy & {
    socket?: {
      emit: jest.Mock;
      removeAllListeners: jest.Mock;
      on?: jest.Mock;
      io?: { on: jest.Mock };
    };
  };
}

function asSyncAccess(service: MapSyncService): MapSyncServiceInternal {
  return service as unknown as MapSyncServiceInternal;
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
  let utilsService: jest.Mocked<UtilsService>;
  let toastService: jest.Mocked<ToastService>;
  let dialogService: jest.Mocked<DialogService>;
  let toastrService: jest.Mocked<ToastrService>;

  const mockNode: ExportNodeProperties = {
    id: 'node-1',
    name: 'Test Node',
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
  };

  const mockMapSnapshot: ExportNodeProperties[] = [mockNode];

  const mockServerMap = {
    uuid: 'test-uuid',
    lastModified: new Date().toISOString(),
    deletedAt: new Date(Date.now() + 86400000).toISOString(),
    deleteAfterDays: 30,
    data: mockMapSnapshot,
    options: { fontMaxSize: 18, fontMinSize: 10, fontIncrement: 2 },
    createdAt: new Date().toISOString(),
  };

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
      history: jest.fn().mockReturnValue({ snapshots: [] }),
    } as unknown as jest.Mocked<MmpService>;

    settingsService = {
      getCachedUserSettings: jest.fn(),
      getCachedSystemSettings: jest.fn().mockReturnValue({
        featureFlags: { yjs: false, pictograms: false, ai: false },
      }),
      setEditMode: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    toastService = {
      showValidationCorrection: jest.fn(),
    } as unknown as jest.Mocked<ToastService>;

    dialogService = {
      openCriticalErrorDialog: jest.fn(),
    } as unknown as jest.Mocked<DialogService>;

    toastrService = {
      error: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
    } as unknown as jest.Mocked<ToastrService>;

    utilsService = createMockUtilsService();

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
        { provide: HttpService, useValue: { get: jest.fn(), post: jest.fn() } },
        {
          provide: StorageService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        { provide: SettingsService, useValue: settingsService },
        { provide: UtilsService, useValue: utilsService },
        { provide: ToastService, useValue: toastService },
        { provide: DialogService, useValue: dialogService },
        { provide: ToastrService, useValue: toastrService },
      ],
    });

    service = TestBed.inject(MapSyncService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('operation response handling', () => {
    let handleResponse: (response: OperationResponse<unknown>) => Promise<void>;

    beforeEach(() => {
      const emitSpy = jest.fn(
        (
          _event: string,
          _data: unknown,
          callback?: (response: OperationResponse<unknown>) => Promise<void>
        ) => {
          if (callback) handleResponse = callback;
        }
      );

      const socketSpy = {
        emit: emitSpy,
        removeAllListeners: jest.fn(),
      };
      asSyncAccess(service).syncStrategy.socket = socketSpy;
      jest.spyOn(service, 'getAttachedMap').mockReturnValue({
        key: 'map-test',
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

      // Trigger an emit to capture the callback
      const strategy = asSyncAccess(service).syncStrategy;
      (
        strategy as unknown as {
          emitAddNode: (node: ExportNodeProperties) => void;
        }
      ).emitAddNode(mockNode);
    });

    it('success response triggers no side effects', async () => {
      const successResponse: SuccessResponse<ExportNodeProperties[]> = {
        success: true,
        data: [mockNode],
      };

      await handleResponse(successResponse);

      expect({
        mapReloaded: mmpService.new.mock.calls.length,
        toastShown: toastService.showValidationCorrection.mock.calls.length,
        dialogOpened: dialogService.openCriticalErrorDialog.mock.calls.length,
      }).toEqual({ mapReloaded: 0, toastShown: 0, dialogOpened: 0 });
    });

    it('error with fullMapState reloads map', async () => {
      const errorResponse: ValidationErrorResponse = {
        success: false,
        errorType: 'validation',
        code: 'INVALID_PARENT',
        message: 'Invalid parent',
        fullMapState: mockServerMap,
      };

      await handleResponse(errorResponse);

      expect(mmpService.new).toHaveBeenCalledWith(mockMapSnapshot, false);
    });

    it('error with fullMapState shows toast', async () => {
      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
        fullMapState: mockServerMap,
      };

      await handleResponse(errorResponse);

      expect(toastService.showValidationCorrection).toHaveBeenCalledWith(
        'add node',
        'Operation failed - map reloaded from server'
      );
    });

    it('error without fullMapState shows critical dialog', async () => {
      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
      };

      await handleResponse(errorResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'SERVER_ERROR',
        message: expect.stringContaining('server encountered an error'),
      });
    });

    it('malformed response shows critical dialog', async () => {
      const malformedResponse = {
        invalid: 'response',
      } as unknown as OperationResponse<unknown>;

      await handleResponse(malformedResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: expect.stringContaining('invalid response'),
      });
    });

    it('malformed response with translation failure uses fallback message', async () => {
      utilsService.translate.mockImplementation(async () => {
        throw new Error('Translation failed');
      });

      const malformedResponse = {
        invalid: 'response',
      } as unknown as OperationResponse<unknown>;

      await handleResponse(malformedResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: 'Invalid server response. Please try again.',
      });
    });

    it('error with malformed fullMapState shows critical dialog', async () => {
      const errorResponse: ValidationErrorResponse = {
        success: false,
        errorType: 'validation',
        code: 'INVALID_PARENT',
        message: 'Invalid parent',
        fullMapState: {
          uuid: 'test-uuid',
          data: [],
        } as unknown as typeof mockServerMap,
      };

      await handleResponse(errorResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: expect.stringContaining('invalid response'),
      });
    });

    it('error without fullMapState with translation failure uses fallback', async () => {
      utilsService.translate.mockImplementation(async () => {
        throw new Error('Translation failed');
      });

      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
      };

      await handleResponse(errorResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'SERVER_ERROR',
        message: 'An error occurred. Please try again.',
      });
    });
  });

  describe('map initialization', () => {
    beforeEach(() => {
      const mockCachedMapEntry = {
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
      };

      jest.spyOn(service, 'getAttachedMap').mockReturnValue(mockCachedMapEntry);

      const socketSpy = {
        emit: jest.fn(),
        on: jest.fn().mockReturnThis(),
        removeAllListeners: jest.fn(),
        io: {
          on: jest.fn().mockReturnThis(),
        },
      };

      asSyncAccess(service).syncStrategy.socket = socketSpy;
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

  describe('strategy delegation', () => {
    it('delegates undo to sync strategy', () => {
      const strategy = asSyncAccess(service).syncStrategy;
      jest.spyOn(strategy, 'undo');

      service.undo();

      expect(strategy.undo).toHaveBeenCalled();
    });

    it('delegates redo to sync strategy', () => {
      const strategy = asSyncAccess(service).syncStrategy;
      jest.spyOn(strategy, 'redo');

      service.redo();

      expect(strategy.redo).toHaveBeenCalled();
    });

    it('delegates destroy on ngOnDestroy', () => {
      const strategy = asSyncAccess(service).syncStrategy;
      jest.spyOn(strategy, 'destroy');

      service.ngOnDestroy();

      expect(strategy.destroy).toHaveBeenCalled();
    });

    it('delegates detach on reset', () => {
      const strategy = asSyncAccess(service).syncStrategy;
      jest.spyOn(strategy, 'detach');

      service.reset();

      expect(strategy.detach).toHaveBeenCalled();
    });
  });
});

describe('parseWriteAccessMessage edit mode behavior', () => {
  let service: MapSyncService;
  let settingsService: jest.Mocked<SettingsService>;

  interface YjsSyncInternals {
    parseWriteAccessMessage: (e: MessageEvent) => void;
    yjsWritable: boolean;
    yjsSynced: boolean;
  }

  interface MapSyncServiceWithStrategy {
    syncStrategy: YjsSyncInternals;
  }

  beforeEach(() => {
    const mmpService = {
      new: jest.fn(),
      selectNode: jest.fn(),
      getRootNode: jest
        .fn()
        .mockReturnValue(
          createMockNode({ id: 'root', name: 'Root', isRoot: true })
        ),
      on: jest.fn().mockReturnValue({
        subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
      }),
      updateNode: jest.fn(),
      existNode: jest.fn().mockReturnValue(true),
      addNodesFromServer: jest.fn(),
      removeNode: jest.fn(),
      highlightNode: jest.fn(),
      exportAsJSON: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<MmpService>;

    settingsService = {
      getCachedUserSettings: jest.fn().mockReturnValue({
        mapOptions: { rootNode: 'Root' },
      }),
      getCachedSystemSettings: jest.fn().mockReturnValue({
        featureFlags: { yjs: true, pictograms: false, ai: false },
      }),
      setEditMode: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    TestBed.configureTestingModule({
      providers: [
        MapSyncService,
        { provide: MmpService, useValue: mmpService },
        { provide: HttpService, useValue: { get: jest.fn(), post: jest.fn() } },
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

  it('does not call setEditMode when not yet synced', () => {
    const writeAccessData = new Uint8Array([4, 1]).buffer;
    const event = new MessageEvent('message', { data: writeAccessData });

    (
      service as unknown as MapSyncServiceWithStrategy
    ).syncStrategy.parseWriteAccessMessage(event);

    expect(settingsService.setEditMode).not.toHaveBeenCalled();
  });

  it('calls setEditMode when already synced', () => {
    (service as unknown as MapSyncServiceWithStrategy).syncStrategy.yjsSynced =
      true;

    const writeAccessData = new Uint8Array([4, 1]).buffer;
    const event = new MessageEvent('message', { data: writeAccessData });

    (
      service as unknown as MapSyncServiceWithStrategy
    ).syncStrategy.parseWriteAccessMessage(event);

    expect(settingsService.setEditMode).toHaveBeenCalledWith(true);
  });

  it('stores yjsWritable=false without calling setEditMode when not synced', () => {
    const readOnlyData = new Uint8Array([4, 0]).buffer;
    const event = new MessageEvent('message', { data: readOnlyData });

    (
      service as unknown as MapSyncServiceWithStrategy
    ).syncStrategy.parseWriteAccessMessage(event);

    expect(settingsService.setEditMode).not.toHaveBeenCalled();
  });

  it('does not store yjsWritable for non-write-access messages', () => {
    const nonWriteAccessData = new Uint8Array([0, 1]).buffer;
    const event = new MessageEvent('message', { data: nonWriteAccessData });

    (
      service as unknown as MapSyncServiceWithStrategy
    ).syncStrategy.parseWriteAccessMessage(event);

    expect(settingsService.setEditMode).not.toHaveBeenCalled();
    expect(
      (service as unknown as MapSyncServiceWithStrategy).syncStrategy
        .yjsWritable
    ).toBe(false);
  });
});
