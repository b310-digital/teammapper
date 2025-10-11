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

// Mock the NodePropertyMapping module
jest.mock('@mmp/index', () => ({
  NodePropertyMapping: {
    name: ['name'],
    locked: ['locked'],
    coordinates: ['coordinates'],
    imageSrc: ['image', 'src'],
    imageSize: ['image', 'size'],
    linkHref: ['link', 'href'],
    backgroundColor: ['colors', 'background'],
    branchColor: ['colors', 'branch'],
    fontWeight: ['font', 'weight'],
    fontStyle: ['font', 'style'],
    fontSize: ['font', 'size'],
    nameColor: ['colors', 'name'],
    hidden: ['hidden'],
  },
}));

// Import NodePropertyMapping after mocking - needed for service to work
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { NodePropertyMapping } from '@mmp/index';

/**
 * Type helper for accessing private members of MapSyncService in tests.
 * Private methods contain important logic that needs unit testing.
 */
interface MapSyncServicePrivate {
  socket: jasmine.SpyObj<unknown>;
  getUserFriendlyErrorMessage: (code: string, msg: string) => string;
}

/**
 * Helper function to safely access private members of MapSyncService.
 * Uses double cast to bypass TypeScript's protection of private members.
 */
function asPrivate(service: MapSyncService): MapSyncServicePrivate {
  return service as unknown as MapSyncServicePrivate;
}

/**
 * Factory function to create fully-typed mock nodes.
 * Ensures all required properties are present, preventing partial mock type assertions.
 */
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
  let mmpService: jasmine.SpyObj<MmpService>;
  let httpService: jasmine.SpyObj<HttpService>;
  let storageService: jasmine.SpyObj<StorageService>;
  let settingsService: jasmine.SpyObj<SettingsService>;
  let toastService: jasmine.SpyObj<ToastService>;
  let dialogService: jasmine.SpyObj<DialogService>;
  let toastrService: jasmine.SpyObj<ToastrService>;

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
    mmpService = jasmine.createSpyObj('MmpService', [
      'new',
      'addNode',
      'updateNode',
      'removeNode',
      'addNodesFromServer',
      'updateAdditionalMapOptions',
      'highlightNode',
      'existNode',
      'getNode',
      'selectNode',
      'getRootNode',
      'exportAsJSON',
      'editNode',
      'on',
    ]);

    httpService = jasmine.createSpyObj('HttpService', ['get', 'post']);
    storageService = jasmine.createSpyObj('StorageService', ['get', 'set']);
    settingsService = jasmine.createSpyObj('SettingsService', [
      'setEditMode',
      'getCachedSettings',
    ]);
    toastService = jasmine.createSpyObj('ToastService', [
      'showValidationCorrection',
    ]);
    dialogService = jasmine.createSpyObj('DialogService', [
      'openCriticalErrorDialog',
    ]);
    toastrService = jasmine.createSpyObj('ToastrService', [
      'error',
      'success',
      'warning',
    ]);

    mmpService.on.and.returnValue({
      subscribe: jasmine
        .createSpy('subscribe')
        .and.returnValue({ unsubscribe: jasmine.createSpy() }),
    });
    mmpService.getRootNode.and.returnValue(
      createMockNode({ id: 'root', name: 'Root', isRoot: true })
    );
    mmpService.selectNode.and.returnValue(mockNode);
    settingsService.getCachedSettings.and.returnValue({
      mapOptions: { rootNode: 'Root' },
    } as unknown);

    TestBed.configureTestingModule({
      providers: [
        MapSyncService,
        { provide: MmpService, useValue: mmpService },
        { provide: HttpService, useValue: httpService },
        { provide: StorageService, useValue: storageService },
        { provide: SettingsService, useValue: settingsService },
        { provide: ToastService, useValue: toastService },
        { provide: DialogService, useValue: dialogService },
        { provide: ToastrService, useValue: toastrService },
        { provide: UtilsService, useValue: {} },
      ],
    });

    service = TestBed.inject(MapSyncService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('operation response handling', () => {
    let handleResponse: (response: OperationResponse<unknown>) => void;

    beforeEach(() => {
      const emitSpy = jest.fn(
        (
          _event: string,
          _data: unknown,
          callback?: (response: OperationResponse<unknown>) => void
        ) => {
          if (callback) handleResponse = callback;
        }
      );

      const socketSpy = {
        emit: emitSpy,
        removeAllListeners: jest.fn(),
      };
      asPrivate(service).socket = socketSpy as jasmine.SpyObj<unknown>;
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

      service.addNode(mockNode);
    });

    it('success response does nothing', () => {
      const successResponse: SuccessResponse<ExportNodeProperties[]> = {
        success: true,
        data: [mockNode],
      };

      handleResponse(successResponse);

      expect(mmpService.new).not.toHaveBeenCalled();
      expect(toastService.showValidationCorrection).not.toHaveBeenCalled();
      expect(dialogService.openCriticalErrorDialog).not.toHaveBeenCalled();
    });

    it('error with fullMapState reloads map', () => {
      const errorResponse: ValidationErrorResponse = {
        success: false,
        errorType: 'validation',
        code: 'INVALID_PARENT',
        message: 'Invalid parent',
        fullMapState: mockServerMap,
      };

      handleResponse(errorResponse);

      expect(mmpService.new).toHaveBeenCalledWith(mockMapSnapshot, false);
    });

    it('error with fullMapState shows toast', () => {
      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
        fullMapState: mockServerMap,
      };

      handleResponse(errorResponse);

      expect(toastService.showValidationCorrection).toHaveBeenCalledWith(
        'add node',
        'Operation failed - map reloaded from server'
      );
    });

    it('error without fullMapState shows critical dialog', () => {
      const errorResponse: CriticalErrorResponse = {
        success: false,
        errorType: 'critical',
        code: 'SERVER_ERROR',
        message: 'Server error',
      };

      handleResponse(errorResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'SERVER_ERROR',
        message: jasmine.stringContaining('server encountered an error'),
      });
    });

    it('malformed response shows critical dialog', () => {
      const malformedResponse = {
        invalid: 'response',
      } as unknown as OperationResponse<unknown>;

      handleResponse(malformedResponse);

      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: jasmine.stringContaining('invalid response'),
      });
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('returns user-friendly message for known codes', () => {
      const message = asPrivate(service).getUserFriendlyErrorMessage(
        'SERVER_ERROR',
        'CRITICAL_ERROR.SERVER_ERROR'
      );

      expect(message).toContain('server encountered an error');
    });

    it('returns default message for unknown codes', () => {
      const message = asPrivate(service).getUserFriendlyErrorMessage(
        'UNKNOWN_CODE',
        'CRITICAL_ERROR.UNKNOWN'
      );

      expect(message).toContain('unexpected error occurred');
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

      const socketSpy = jasmine.createSpyObj('Socket', [
        'emit',
        'on',
        'removeAllListeners',
      ]);
      socketSpy.on.and.returnValue(socketSpy);
      socketSpy.emit.and.stub();

      const socketIoSpy = jasmine.createSpyObj('SocketIO', ['on']);
      socketIoSpy.on.and.returnValue(socketIoSpy);
      socketSpy.io = socketIoSpy;

      asPrivate(service).socket = socketSpy;
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
      mmpService.getRootNode.and.returnValue(rootNode);
      mmpService.selectNode.and.returnValue(rootNode);

      service.initMap();

      expect(mmpService.selectNode).toHaveBeenCalledWith('root');
    });
  });
});
