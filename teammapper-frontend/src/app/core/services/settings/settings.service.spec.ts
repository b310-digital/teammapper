import { CachedAdminMapValue } from 'src/app/shared/models/cached-map.model';
import { HttpService } from '../../http/http.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let settingsService: SettingsService;
  let httpService: jest.Mocked<HttpService>;
  let storageService: jest.Mocked<StorageService>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock implementations
    httpService = {
      get: jest.fn(),
      delete: jest.fn(),
      post: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    storageService = {
      get: jest.fn(),
      getAll: jest.fn(),
      getAllEntries: jest.fn(),
      getAllCreatedMapsFromStorage: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<StorageService>;

    settingsService = new SettingsService(storageService, httpService);
  });

  it('ignores old maps when returning from storage', async () => {
    // Setup
    const oldDate = new Date();
    oldDate.setFullYear(new Date().getFullYear() - 1);
    const cachedMapDataFromStorage: CachedAdminMapValue = {
      ttl: oldDate,
      modificationSecret: '456',
      adminId: '123',
      rootName: 'test',
      createdAt: new Date(),
    };

    storageService.getAllCreatedMapsFromStorage.mockResolvedValue([
      ['123', cachedMapDataFromStorage],
    ]);

    // Test
    const result = await settingsService.getCachedAdminMapEntries();

    // Assert
    expect(result).toEqual([]);
    expect(storageService.getAllCreatedMapsFromStorage).toHaveBeenCalled();
  });

  it('returns sorted cached maps from storage', async () => {
    // Setup
    const futureDateOne = new Date();
    futureDateOne.setFullYear(new Date().getFullYear() + 2);
    const futureDateTwo = new Date();
    futureDateTwo.setFullYear(new Date().getFullYear() + 1);

    const cachedMapDataFromStorage: CachedAdminMapValue = {
      ttl: futureDateOne,
      modificationSecret: '456',
      adminId: '123',
      rootName: 'test',
      createdAt: new Date(),
    };

    const otherCachedMapDataFromStorage: CachedAdminMapValue = {
      ttl: futureDateTwo,
      modificationSecret: '456',
      adminId: '123',
      rootName: 'test',
      createdAt: new Date(),
    };

    storageService.getAllCreatedMapsFromStorage.mockResolvedValue([
      ['789', otherCachedMapDataFromStorage],
      ['123', cachedMapDataFromStorage],
    ]);

    // Test
    const result = await settingsService.getCachedAdminMapEntries();

    // Assert
    expect(result).toEqual([
      { id: '123', cachedAdminMapValue: cachedMapDataFromStorage },
      { id: '789', cachedAdminMapValue: otherCachedMapDataFromStorage },
    ]);
    expect(storageService.getAllCreatedMapsFromStorage).toHaveBeenCalled();
  });

  // Additional tests for full coverage
  describe('init', () => {
    it('initializes settings with default values when no cached settings exist', async () => {
      const defaultSettings = { language: 'en' };

      httpService.get.mockResolvedValue({
        json: () => Promise.resolve(defaultSettings),
      });
      storageService.get.mockResolvedValue(null);

      await settingsService.init();

      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        defaultSettings
      );
    });

    it('initializes settings with cached values when they exist', async () => {
      const defaultSettings = { language: 'en' };
      const cachedSettings = { language: 'fr' };

      httpService.get.mockResolvedValue({
        json: () => Promise.resolve(defaultSettings),
      });
      storageService.get.mockResolvedValue(cachedSettings);

      await settingsService.init();

      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        cachedSettings
      );
    });
  });
});
