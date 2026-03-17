import { MmpService } from '../mmp/mmp.service';
import { UtilsService } from '../utils/utils.service';
import { ToastService } from '../toast/toast.service';
import { DialogService } from '../dialog/dialog.service';
import {
  OperationResponse,
  ValidationErrorResponse,
  CriticalErrorResponse,
  ServerMap,
} from './server-types';

// Validate ServerMap structure at runtime
export function isValidServerMap(map: unknown): map is ServerMap {
  if (!map || typeof map !== 'object') return false;

  const serverMap = map as ServerMap;

  return (
    typeof serverMap.uuid === 'string' &&
    serverMap.uuid.length > 0 &&
    Array.isArray(serverMap.data) &&
    serverMap.data.length > 0 &&
    typeof serverMap.lastModified === 'string' &&
    typeof serverMap.createdAt === 'string' &&
    typeof serverMap.deletedAt === 'string' &&
    typeof serverMap.deleteAfterDays === 'number' &&
    typeof serverMap.options === 'object'
  );
}

// Type guard to validate error response structure at runtime
export function isValidErrorResponse(
  response: OperationResponse<unknown>
): response is ValidationErrorResponse | CriticalErrorResponse {
  if (response.success !== false) return false;

  const errorResponse = response as
    | ValidationErrorResponse
    | CriticalErrorResponse;

  const isBasicStructureValid =
    typeof errorResponse.errorType === 'string' &&
    (errorResponse.errorType === 'validation' ||
      errorResponse.errorType === 'critical') &&
    typeof errorResponse.code === 'string' &&
    errorResponse.code.trim() !== '' &&
    typeof errorResponse.message === 'string';

  if (!isBasicStructureValid) return false;

  if (errorResponse.fullMapState) {
    return isValidServerMap(errorResponse.fullMapState);
  }

  return true;
}

export class MapSyncErrorHandler {
  constructor(
    private mmpService: MmpService,
    private utilsService: UtilsService,
    private toastService: ToastService,
    private dialogService: DialogService
  ) {}

  // Simplified handler for all operation responses
  async handleOperationResponse(
    response: OperationResponse<unknown>,
    operationName: string
  ): Promise<void> {
    if (response.success) {
      return;
    }

    if (!isValidErrorResponse(response)) {
      await this.showMalformedResponseError();
      return;
    }

    if (response.fullMapState) {
      await this.handleRecoverableError(response, operationName);
    } else {
      await this.handleCriticalError(response);
    }
  }

  private async showMalformedResponseError(): Promise<void> {
    let message: string;
    try {
      message = await this.utilsService.translate(
        'TOASTS.ERRORS.MALFORMED_RESPONSE'
      );
    } catch {
      message = 'Invalid server response. Please try again.';
    }
    this.dialogService.openCriticalErrorDialog({
      code: 'MALFORMED_RESPONSE',
      message,
    });
  }

  private async handleRecoverableError(
    response: ValidationErrorResponse | CriticalErrorResponse,
    operationName: string
  ): Promise<void> {
    this.mmpService.new(response.fullMapState.data, false);

    let message: string;
    try {
      message = await this.utilsService.translate(
        'TOASTS.ERRORS.OPERATION_FAILED_MAP_RELOADED'
      );
    } catch {
      message = 'Operation failed - map reloaded';
    }
    this.toastService.showValidationCorrection(operationName, message);
  }

  private async handleCriticalError(
    response: ValidationErrorResponse | CriticalErrorResponse
  ): Promise<void> {
    const userMessage = await this.getUserFriendlyErrorMessage(
      response.code || 'SERVER_ERROR',
      response.message || 'Unknown error'
    );

    this.dialogService.openCriticalErrorDialog({
      code: response.code || 'SERVER_ERROR',
      message: userMessage,
    });
  }

  // Convert error code to user-friendly translated message
  private async getUserFriendlyErrorMessage(
    code: string,
    _messageKey: string
  ): Promise<string> {
    const errorKeyMapping: Record<string, string> = {
      NETWORK_TIMEOUT: 'TOASTS.ERRORS.NETWORK_TIMEOUT',
      SERVER_ERROR: 'TOASTS.ERRORS.SERVER_ERROR',
      AUTH_FAILED: 'TOASTS.ERRORS.AUTH_FAILED',
      MALFORMED_REQUEST: 'TOASTS.ERRORS.MALFORMED_REQUEST',
      RATE_LIMIT_EXCEEDED: 'TOASTS.ERRORS.RATE_LIMIT_EXCEEDED',
    };

    const translationKey =
      errorKeyMapping[code] || 'TOASTS.ERRORS.UNEXPECTED_ERROR';

    try {
      return await this.utilsService.translate(translationKey);
    } catch {
      return 'An error occurred. Please try again.';
    }
  }
}
