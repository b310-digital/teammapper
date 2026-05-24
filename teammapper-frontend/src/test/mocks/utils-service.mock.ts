import { UtilsService } from '../../app/core/services/utils/utils.service';

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

  // Configure translate spy to echo the key back
  mock.translate.mockImplementation(async (key: string) => key);

  // Configure confirmDialog with default behavior (returns true)
  mock.confirmDialog.mockResolvedValue(true);

  // Configure blobToBase64 with default behavior
  mock.blobToBase64.mockResolvedValue('data:image/png;base64,mock');

  return mock;
}
