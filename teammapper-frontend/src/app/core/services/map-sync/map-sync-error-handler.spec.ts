import { MmpService } from '../mmp/mmp.service';
import { UtilsService } from '../utils/utils.service';
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
import { MapSyncErrorHandler } from './map-sync-error-handler';

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

describe('MapSyncErrorHandler', () => {
  let handler: MapSyncErrorHandler;
  let mmpService: jest.Mocked<MmpService>;
  let utilsService: jest.Mocked<UtilsService>;
  let toastService: jest.Mocked<ToastService>;
  let dialogService: jest.Mocked<DialogService>;

  const mockNode = createMockNode({ id: 'node-1', name: 'Test Node' });
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
    } as unknown as jest.Mocked<MmpService>;

    utilsService = createMockUtilsService();

    toastService = {
      showValidationCorrection: jest.fn(),
    } as unknown as jest.Mocked<ToastService>;

    dialogService = {
      openCriticalErrorDialog: jest.fn(),
    } as unknown as jest.Mocked<DialogService>;

    handler = new MapSyncErrorHandler(
      mmpService,
      utilsService,
      toastService,
      dialogService
    );
  });

  it('success response triggers no side effects', async () => {
    const response: SuccessResponse<ExportNodeProperties[]> = {
      success: true,
      data: [mockNode],
    };

    await handler.handleOperationResponse(response, 'add node');

    expect({
      mapReloaded: mmpService.new.mock.calls.length,
      toastShown: toastService.showValidationCorrection.mock.calls.length,
      dialogOpened: dialogService.openCriticalErrorDialog.mock.calls.length,
    }).toEqual({ mapReloaded: 0, toastShown: 0, dialogOpened: 0 });
  });

  it('error with fullMapState reloads map', async () => {
    const response: ValidationErrorResponse = {
      success: false,
      errorType: 'validation',
      code: 'INVALID_PARENT',
      message: 'Invalid parent',
      fullMapState: mockServerMap,
    };

    await handler.handleOperationResponse(response, 'add node');

    expect(mmpService.new).toHaveBeenCalledWith(mockMapSnapshot, false);
  });

  it('error with fullMapState shows toast', async () => {
    const response: CriticalErrorResponse = {
      success: false,
      errorType: 'critical',
      code: 'SERVER_ERROR',
      message: 'Server error',
      fullMapState: mockServerMap,
    };

    await handler.handleOperationResponse(response, 'add node');

    expect(toastService.showValidationCorrection).toHaveBeenCalledWith(
      'add node',
      'Operation failed - map reloaded from server'
    );
  });

  it('error without fullMapState shows critical dialog', async () => {
    const response: CriticalErrorResponse = {
      success: false,
      errorType: 'critical',
      code: 'SERVER_ERROR',
      message: 'Server error',
    };

    await handler.handleOperationResponse(response, 'add node');

    expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
      code: 'SERVER_ERROR',
      message: expect.stringContaining('server encountered an error'),
    });
  });

  it('malformed response shows critical dialog', async () => {
    const response = {
      invalid: 'response',
    } as unknown as OperationResponse<unknown>;

    await handler.handleOperationResponse(response, 'add node');

    expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
      code: 'MALFORMED_RESPONSE',
      message: expect.stringContaining('invalid response'),
    });
  });

  it('malformed response with translation failure uses fallback', async () => {
    utilsService.translate.mockImplementation(async () => {
      throw new Error('Translation failed');
    });

    const response = {
      invalid: 'response',
    } as unknown as OperationResponse<unknown>;

    await handler.handleOperationResponse(response, 'add node');

    expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
      code: 'MALFORMED_RESPONSE',
      message: 'Invalid server response. Please try again.',
    });
  });

  it('error with malformed fullMapState shows critical dialog', async () => {
    const response: ValidationErrorResponse = {
      success: false,
      errorType: 'validation',
      code: 'INVALID_PARENT',
      message: 'Invalid parent',
      fullMapState: {
        uuid: 'test-uuid',
        data: [],
      } as unknown as typeof mockServerMap,
    };

    await handler.handleOperationResponse(response, 'add node');

    expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
      code: 'MALFORMED_RESPONSE',
      message: expect.stringContaining('invalid response'),
    });
  });

  it('error without fullMapState with translation failure uses fallback', async () => {
    utilsService.translate.mockImplementation(async () => {
      throw new Error('Translation failed');
    });

    const response: CriticalErrorResponse = {
      success: false,
      errorType: 'critical',
      code: 'SERVER_ERROR',
      message: 'Server error',
    };

    await handler.handleOperationResponse(response, 'add node');

    expect(dialogService.openCriticalErrorDialog).toHaveBeenCalledWith({
      code: 'SERVER_ERROR',
      message: 'An error occurred. Please try again.',
    });
  });
});
