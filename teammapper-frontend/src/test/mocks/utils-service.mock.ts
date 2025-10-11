import { UtilsService } from '../../app/core/services/utils/utils.service';

/**
 * Centralized translation keys for tests
 * Keeps test translations consistent with production keys
 */
export const MOCK_TRANSLATIONS: Record<string, string> = {
  'TOASTS.ERRORS.OPERATION_FAILED_MAP_RELOADED':
    'Operation failed - map reloaded from server',
  'TOASTS.ERRORS.MALFORMED_RESPONSE':
    'Received invalid response from server. Please reload the page.',
  'TOASTS.ERRORS.SERVER_ERROR':
    'The server encountered an error. Your recent changes may not have been saved.',
  'TOASTS.ERRORS.NETWORK_TIMEOUT':
    'We lost connection to the server. Your changes may not have been saved.',
  'TOASTS.ERRORS.AUTH_FAILED':
    'Authentication failed. You may need to reload and sign in again.',
  'TOASTS.ERRORS.MALFORMED_REQUEST':
    'There was a problem with your request. Please try again.',
  'TOASTS.ERRORS.RATE_LIMIT_EXCEEDED':
    'Too many requests. Please wait a moment before trying again.',
  'TOASTS.ERRORS.UNEXPECTED_ERROR':
    'An unexpected error occurred. Please reload the page.',
};

/**
 * Creates a properly configured mock UtilsService for testing
 * Includes all instance methods with sensible defaults
 *
 * @returns Jest mock object with configured translate method
 */
export function createMockUtilsService(): jest.Mocked<UtilsService> {
  const mock = {
    translate: jest.fn(),
    confirmDialog: jest.fn(),
    blobToBase64: jest.fn(),
  } as unknown as jest.Mocked<UtilsService>;

  // Configure translate spy with realistic return values
  mock.translate.mockImplementation(async (key: string) => {
    return MOCK_TRANSLATIONS[key] || key;
  });

  // Configure confirmDialog with default behavior (returns true)
  mock.confirmDialog.mockResolvedValue(true);

  // Configure blobToBase64 with default behavior
  mock.blobToBase64.mockResolvedValue('data:image/png;base64,mock');

  return mock;
}
