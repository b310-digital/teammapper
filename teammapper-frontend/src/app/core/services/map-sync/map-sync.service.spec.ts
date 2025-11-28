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
  socket: {
    emit: jest.Mock;
    removeAllListeners: jest.Mock;
    on?: jest.Mock;
    io?: {
      on: jest.Mock;
    };
  };
  getUserFriendlyErrorMessage: (code: string, msg: string) => Promise<string>;
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
  let mmpService: jest.Mocked<MmpService>;
  let httpService: jest.Mocked<HttpService>;
  let storageService: jest.Mocked<StorageService>;
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
    // Only mock methods that are actually used in these tests
    mmpService = {
      new: jest.fn(),
      selectNode: jest.fn(),
      getRootNode: jest.fn(),
      on: jest.fn(),
    } as unknown as jest.Mocked<MmpService>;

    httpService = {
      get: jest.fn(),
      post: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    storageService = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    settingsService = {
      getCachedUserSettings: jest.fn(),
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

    // Create mock UtilsService using shared test utility
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
        { provide: HttpService, useValue: httpService },
        { provide: StorageService, useValue: storageService },
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
      asPrivate(service).socket = socketSpy;
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

    it('success response does nothing', async () => {
      const successResponse: SuccessResponse<ExportNodeProperties[]> = {
        success: true,
        data: [mockNode],
      };

      await handleResponse(successResponse);

      expect(mmpService.new).not.toHaveBeenCalled();
      expect(toastService.showValidationCorrection).not.toHaveBeenCalled();
      expect(dialogService.openCriticalErrorDialog).not.toHaveBeenCalled();
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
      // Simulate translation service failure
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
          // Missing required fields - malformed
          uuid: 'test-uuid',
          data: [],
        } as unknown as typeof mockServerMap,
      };

      await handleResponse(errorResponse);

      // Should treat as malformed response since fullMapState is invalid
      expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
        code: 'MALFORMED_RESPONSE',
        message: expect.stringContaining('invalid response'),
      });
      expect(mmpService.new).not.toHaveBeenCalled();
    });

    it('error without fullMapState with translation failure uses fallback', async () => {
      // Simulate translation service failure
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

  describe('getUserFriendlyErrorMessage', () => {
    it('returns user-friendly message for known codes', async () => {
      const message = await asPrivate(service).getUserFriendlyErrorMessage(
        'SERVER_ERROR',
        'CRITICAL_ERROR.SERVER_ERROR'
      );

      expect(message).toContain('server encountered an error');
    });

    it('returns default message for unknown codes', async () => {
      const message = await asPrivate(service).getUserFriendlyErrorMessage(
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

      const socketSpy = {
        emit: jest.fn(),
        on: jest.fn().mockReturnThis(),
        removeAllListeners: jest.fn(),
        io: {
          on: jest.fn().mockReturnThis(),
        },
      };

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
      mmpService.getRootNode.mockReturnValue(rootNode);
      mmpService.selectNode.mockReturnValue(rootNode);

      service.initMap();

      expect(mmpService.selectNode).toHaveBeenCalledWith('root');
    });
  });
});
