import {
  CachedAdminMapValue,
  MapNodeSettings,
  UserMapOptions,
} from '@teammapper/shared';
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

  it('keeps maps without a deletion date and lists them first', async () => {
    const neverExpires: CachedAdminMapValue = {
      ttl: null,
      modificationSecret: '456',
      adminId: '123',
      rootName: 'test',
    };
    const expiring: CachedAdminMapValue = {
      ...neverExpires,
      ttl: new Date(Date.now() + 86400000),
    };
    storageService.getAllCreatedMapsFromStorage.mockResolvedValue([
      ['789', expiring],
      ['123', neverExpires],
    ]);

    const result = await settingsService.getCachedAdminMapEntries();

    expect(result.map(entry => entry.id)).toEqual(['123', '789']);
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

  describe('display name', () => {
    const serverDefaults = (general: object) => ({
      json: () =>
        Promise.resolve({
          userSettings: { general },
          systemSettings: {},
        }),
    });

    async function initWith(stored: object | null) {
      httpService.get.mockResolvedValue(
        serverDefaults({
          language: 'en',
          darkMode: false,
          displayName: '',
        }) as unknown as Response
      );
      storageService.get.mockResolvedValue(stored);
      await settingsService.init();
    }

    it('fills an empty display name into stored settings from an older version and keeps the rest', async () => {
      await initWith({ general: { language: 'de', darkMode: true } });

      expect(storageService.set).toHaveBeenCalledWith('settings', {
        general: { language: 'de', darkMode: true, displayName: '' },
      });
    });

    it('keeps a stored display name', async () => {
      await initWith({
        general: { language: 'de', darkMode: true, displayName: 'Vorname' },
      });

      expect(settingsService.getCachedUserSettings()?.general.displayName).toBe(
        'Vorname'
      );
    });

    it('stores the normalized display name', async () => {
      await initWith(null);

      await settingsService.setDisplayName('  Vorname   Test ');

      expect(storageService.set).toHaveBeenLastCalledWith(
        'settings',
        expect.objectContaining({
          general: expect.objectContaining({ displayName: 'Vorname Test' }),
        })
      );
    });

    it('announces the new display name to subscribers', async () => {
      await initWith(null);
      const names: string[] = [];
      settingsService.userSettings.subscribe(settings =>
        names.push(settings?.general.displayName ?? 'none')
      );

      await settingsService.setDisplayName('Zweiter');

      expect(names).toEqual(['', 'Zweiter']);
    });

    it('does nothing before settings exist', async () => {
      await settingsService.setDisplayName('Vorname');

      expect(storageService.set).not.toHaveBeenCalled();
    });
  });

  describe('other open tabs', () => {
    /** Delivers a message to every other open channel of the same name. */
    class FakeBroadcastChannel {
      static open: FakeBroadcastChannel[] = [];
      private listeners: ((event: MessageEvent) => void)[] = [];

      constructor(readonly name: string) {
        FakeBroadcastChannel.open.push(this);
      }

      addEventListener(_type: 'message', listener: (e: MessageEvent) => void) {
        this.listeners.push(listener);
      }

      postMessage(data: unknown): void {
        const event = {
          data: JSON.parse(JSON.stringify(data)),
        } as MessageEvent;
        FakeBroadcastChannel.open
          .filter(other => other !== this && other.name === this.name)
          .forEach(other =>
            other.listeners.forEach(listener => listener(event))
          );
      }

      close(): void {
        FakeBroadcastChannel.open = FakeBroadcastChannel.open.filter(
          other => other !== this
        );
      }
    }

    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      'BroadcastChannel'
    );

    beforeEach(() => {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        configurable: true,
        writable: true,
        value: FakeBroadcastChannel,
      });
      httpService.get.mockResolvedValue({
        json: () =>
          Promise.resolve({
            userSettings: {
              general: { language: 'en', darkMode: false, displayName: '' },
            },
            systemSettings: {},
          }),
      } as unknown as Response);
      storageService.get.mockResolvedValue(null);
    });

    afterEach(() => {
      FakeBroadcastChannel.open = [];
      if (original) {
        Object.defineProperty(globalThis, 'BroadcastChannel', original);
      } else {
        Reflect.deleteProperty(globalThis, 'BroadcastChannel');
      }
    });

    /** A second service instance, as a further tab of the same browser. */
    async function openTab(): Promise<SettingsService> {
      const tab = TestBed.runInInjectionContext(() => new SettingsService());
      await tab.init();
      return tab;
    }

    it('shows a name saved in one tab in the other open tab', async () => {
      const tabA = await openTab();
      const tabB = await openTab();

      await tabA.setDisplayName('Vorname Test');

      expect(tabB.getCachedUserSettings()?.general.displayName).toBe(
        'Vorname Test'
      );
    });

    it('stores the name once, from the tab that saved it', async () => {
      const tabA = await openTab();
      await openTab();
      storageService.set.mockClear();

      await tabA.setDisplayName('Vorname Test');

      expect(storageService.set).toHaveBeenCalledTimes(1);
    });

    it('keeps the name from another tab when this tab saves another setting', async () => {
      const tabA = await openTab();
      const tabB = await openTab();

      await tabA.setDisplayName('Vorname Test');
      await tabB.setDarkMode(true);

      expect(storageService.set).toHaveBeenLastCalledWith(
        'settings',
        expect.objectContaining({
          general: expect.objectContaining({
            displayName: 'Vorname Test',
            darkMode: true,
          }),
        })
      );
    });

    it('keeps the name from another tab when this tab stores a language', async () => {
      const tabA = await openTab();
      const tabB = await openTab();

      await tabA.setDisplayName('Vorname Test');
      await tabB.setLanguage('de');

      expect(storageService.set).toHaveBeenLastCalledWith(
        'settings',
        expect.objectContaining({
          general: expect.objectContaining({
            displayName: 'Vorname Test',
            language: 'de',
          }),
        })
      );
    });

    it('keeps the name from another tab when this tab stores map options', async () => {
      const node = (): MapNodeSettings => ({
        name: '',
        link: { href: '' },
        image: { src: '', size: 60 },
        colors: { name: '', background: '', branch: '', link: '' },
        font: { size: 16, style: 'normal', weight: 'normal' },
      });
      const mapOptions: UserMapOptions = {
        centerOnResize: false,
        autoBranchColors: true,
        showLinktext: true,
        branchStyle: 'tapered',
        fontMaxSize: 70,
        fontMinSize: 15,
        fontIncrement: 5,
        defaultNode: node(),
        rootNode: node(),
      };
      const tabA = await openTab();
      const tabB = await openTab();

      await tabA.setDisplayName('Vorname Test');
      await tabB.setUserMapOptions(mapOptions);

      expect(storageService.set).toHaveBeenLastCalledWith('settings', {
        general: expect.objectContaining({ displayName: 'Vorname Test' }),
        mapOptions,
      });
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

    it('falls back to cached settings with an empty display name when they lack one', async () => {
      httpService.get.mockRejectedValue(new Error('Network error'));
      storageService.get.mockResolvedValue({
        general: { language: 'de', darkMode: true },
      });

      await settingsService.init();

      expect(settingsService.getCachedUserSettings()?.general).toEqual({
        language: 'de',
        darkMode: true,
        displayName: '',
      });
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
