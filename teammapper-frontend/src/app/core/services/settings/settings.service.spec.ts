import { CachedAdminMapValue } from '@teammapper/shared';
import { HttpService } from '../../http/http.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from './settings.service';
import { TranslateService } from '@ngx-translate/core';
import { TestBed } from '@angular/core/testing';

describe('SettingsService', () => {
  let settingsService: SettingsService;
  let httpService: jest.Mocked<HttpService>;
  let storageService: jest.Mocked<StorageService>;
  let translateService: jest.Mocked<TranslateService>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    document.body.classList.remove('dark-mode');

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

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

    translateService = {
      getBrowserLang: jest.fn(),
    } as unknown as jest.Mocked<TranslateService>;

    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        { provide: HttpService, useValue: httpService },
        { provide: StorageService, useValue: storageService },
        { provide: TranslateService, useValue: translateService },
      ],
    });

    settingsService = TestBed.inject(SettingsService);
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
    };

    const otherCachedMapDataFromStorage: CachedAdminMapValue = {
      ttl: futureDateTwo,
      modificationSecret: '456',
      adminId: '123',
      rootName: 'test',
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
      const defaultSettings = {
        userSettings: { general: { language: 'en', darkMode: false } },
      };

      httpService.get.mockResolvedValue({
        json: () => Promise.resolve(defaultSettings),
      } as unknown as Response);
      storageService.get.mockResolvedValue(null);

      await settingsService.init();

      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        defaultSettings.userSettings
      );
    });

    it('initializes settings with cached values when they exist', async () => {
      const defaultSettings = {
        userSettings: { general: { language: 'en', darkMode: false } },
      };
      const cachedSettings = { general: { language: 'fr', darkMode: true } };

      httpService.get.mockResolvedValue({
        json: () => Promise.resolve(defaultSettings),
      } as unknown as Response);
      storageService.get.mockResolvedValue(cachedSettings);

      await settingsService.init();

      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        cachedSettings
      );
    });
  });

  describe('isMultiTreeEnabled', () => {
    async function initWithFlags(featureFlags: object): Promise<void> {
      httpService.get.mockResolvedValue({
        json: () =>
          Promise.resolve({
            userSettings: { general: { language: 'en', darkMode: false } },
            systemSettings: { featureFlags },
          }),
      } as unknown as Response);
      storageService.get.mockResolvedValue(null);
      await settingsService.init();
    }

    it('returns false before the system settings load', () => {
      expect(settingsService.isMultiTreeEnabled()).toBe(false);
    });

    it('reads the multiTree flag from the system settings', async () => {
      await initWithFlags({ pictograms: false, ai: false, multiTree: true });

      expect(settingsService.isMultiTreeEnabled()).toBe(true);
    });

    it('returns false when the system settings omit the flag', async () => {
      await initWithFlags({ pictograms: false, ai: false });

      expect(settingsService.isMultiTreeEnabled()).toBe(false);
    });
  });

  describe('setDarkMode', () => {
    it('toggles dark mode class on body and persists', async () => {
      const cachedSettings = {
        general: { language: 'en', darkMode: false },
      };
      storageService.get.mockResolvedValue(cachedSettings);
      httpService.get.mockResolvedValue({
        json: () =>
          Promise.resolve({
            userSettings: { general: { language: 'en', darkMode: false } },
          }),
      } as unknown as Response);

      await settingsService.init();
      document.body.classList.remove('dark-mode');

      await settingsService.setDarkMode(true);

      expect(document.body.classList.contains('dark-mode')).toBe(true);
      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        expect.objectContaining({
          general: expect.objectContaining({ darkMode: true }),
        })
      );
    });

    it('removes dark mode class when toggled off', async () => {
      const cachedSettings = {
        general: { language: 'en', darkMode: true },
      };
      storageService.get.mockResolvedValue(cachedSettings);
      httpService.get.mockResolvedValue({
        json: () =>
          Promise.resolve({
            userSettings: { general: { language: 'en', darkMode: true } },
          }),
      } as unknown as Response);

      await settingsService.init();

      await settingsService.setDarkMode(false);

      expect(document.body.classList.contains('dark-mode')).toBe(false);
      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        expect.objectContaining({
          general: expect.objectContaining({ darkMode: false }),
        })
      );
    });
  });

  describe('init with system preference', () => {
    it('uses system dark mode preference when no cached settings', async () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: true,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      const defaultSettings = {
        userSettings: { general: { language: 'en', darkMode: false } },
      };

      httpService.get.mockResolvedValue({
        json: () => Promise.resolve(defaultSettings),
      } as unknown as Response);
      storageService.get.mockResolvedValue(null);

      await settingsService.init();

      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        expect.objectContaining({
          general: expect.objectContaining({ darkMode: true }),
        })
      );
    });

    it('migrates cached settings when darkMode is undefined', async () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: true,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      const legacyCachedSettings = {
        general: { language: 'de' },
      };
      const defaultSettings = {
        userSettings: { general: { language: 'en', darkMode: false } },
      };

      httpService.get.mockResolvedValue({
        json: () => Promise.resolve(defaultSettings),
      } as unknown as Response);
      storageService.get.mockResolvedValue(legacyCachedSettings);

      await settingsService.init();

      expect(storageService.set).toHaveBeenCalledWith(
        'settings',
        expect.objectContaining({
          general: expect.objectContaining({ language: 'de', darkMode: true }),
        })
      );
      expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('falls back to cached settings if fetching defaults fails', async () => {
      const cachedSettings = {
        general: { language: 'de', darkMode: true },
      };
      httpService.get.mockRejectedValue(new Error('Network error'));
      storageService.get.mockResolvedValue(cachedSettings);

      const result = await settingsService.init();

      expect(result).toBe(true);
      expect(settingsService.getCachedUserSettings()).toEqual(cachedSettings);
      expect(document.body.classList.contains('dark-mode')).toBe(true);
    });
  });
});
