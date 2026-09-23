import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CachedAdminMapEntry,
  Settings,
  SUPPORTED_LANGUAGES,
  SystemSettings,
  UserSettings,
} from '@teammapper/shared';
import { API_URL, HttpService } from '../../http/http.service';
import { STORAGE_KEYS, StorageService } from '../storage/storage.service';

/** `getLanguage` returns this when no user settings are cached. */
const DEFAULT_LANGUAGE = 'en';

@Injectable({
  providedIn: 'root',
})
// Global per user settings service
export class SettingsService {
  private document = inject(DOCUMENT);
  private storageService = inject(StorageService);
  private httpService = inject(HttpService);
  private translateService = inject(TranslateService);

  public static readonly LANGUAGES = [...SUPPORTED_LANGUAGES];

  public userSettings: Observable<UserSettings | null>;
  private userSettingsSubject: BehaviorSubject<UserSettings | null>;
  private systemSettingsSubject: BehaviorSubject<SystemSettings | null>;
  private readonly editModeSubject: BehaviorSubject<boolean | null>;
  private readonly darkModeSubject: BehaviorSubject<boolean>;
  public readonly darkMode: Observable<boolean>;

  constructor() {
    // Initialization of the behavior subjects.
    this.userSettingsSubject = new BehaviorSubject<UserSettings | null>(null);
    this.systemSettingsSubject = new BehaviorSubject<SystemSettings | null>(
      null
    );
    this.editModeSubject = new BehaviorSubject<boolean | null>(null);
    this.darkModeSubject = new BehaviorSubject(false);
    this.userSettings = this.userSettingsSubject.asObservable();
    this.darkMode = this.darkModeSubject.asObservable();
  }

  /**
   * Initialize dark mode from system preference if no user setting exists.
   */
  private getSystemDarkModePreference(): boolean {
    const defaultView = this.document.defaultView ?? window;
    return (
      defaultView.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
    );
  }

  /**
   * Resolve user settings with dark mode migration fallback.
   */
  private resolveUserSettings(
    loaded: UserSettings | null,
    defaults: UserSettings
  ): UserSettings {
    if (!loaded) {
      defaults.general.darkMode = this.getSystemDarkModePreference();
      return defaults;
    }
    if (loaded.general.darkMode === undefined) {
      loaded.general.darkMode = this.getSystemDarkModePreference();
    }
    return loaded;
  }

  /**
   * Initialize default settings with browser language.
   */
  private async loadDefaultSettings(): Promise<Settings> {
    const defaults = await this.getDefaultSettings();
    defaults.userSettings.general.language =
      this.translateService.getBrowserLang() ??
      defaults.userSettings.general.language;
    return defaults;
  }

  /**
   * Apply settings to application state and persistence.
   */
  private async applyAndPersistSettings(
    userSettings: UserSettings,
    systemSettings: SystemSettings
  ): Promise<void> {
    await this.storageService.set(STORAGE_KEYS.SETTINGS, userSettings);
    this.userSettingsSubject.next(userSettings);
    this.applyDarkMode(userSettings.general.darkMode);
    this.systemSettingsSubject.next(systemSettings);
  }

  /**
   * Initialize settings with the default or cached values and return them.
   */
  public async init(): Promise<boolean> {
    try {
      const defaults = await this.loadDefaultSettings();
      const loaded = (await this.storageService.get(
        STORAGE_KEYS.SETTINGS
      )) as UserSettings | null;
      const userSettings = this.resolveUserSettings(
        loaded,
        defaults.userSettings
      );
      await this.applyAndPersistSettings(userSettings, defaults.systemSettings);
      return true;
    } catch {
      return await this.initFallbackSettings();
    }
  }

  /**
   * Fallback initialization if backend settings cannot be fetched.
   */
  private async initFallbackSettings(): Promise<boolean> {
    try {
      const cached = (await this.storageService.get(
        STORAGE_KEYS.SETTINGS
      )) as UserSettings | null;
      if (cached) {
        this.userSettingsSubject.next(cached);
        this.applyDarkMode(
          cached.general?.darkMode ?? this.getSystemDarkModePreference()
        );
        return true;
      }
    } catch {
      // Ignore cache retrieval errors during fallback
    }
    this.applyDarkMode(this.getSystemDarkModePreference());
    return false;
  }

  /**
   * Update the settings in the storage.
   */
  public async updateCachedSettings(settings: UserSettings): Promise<void> {
    await this.storageService.set(STORAGE_KEYS.SETTINGS, settings);
    this.userSettingsSubject.next(settings);
    this.applyDarkMode(settings.general.darkMode);
  }

  /**
   * Apply dark mode to the document body.
   */
  private applyDarkMode(isDark: boolean): void {
    if (isDark) {
      this.document.body.classList.add('dark-mode');
    } else {
      this.document.body.classList.remove('dark-mode');
    }
    this.darkModeSubject.next(isDark);
  }

  /**
   * Toggle dark mode and persist the setting.
   */
  public async setDarkMode(value: boolean): Promise<void> {
    const settings = this.getCachedUserSettings();
    if (!settings) return;

    settings.general.darkMode = value;
    await this.updateCachedSettings(settings);
  }

  public async getCachedAdminMapEntries(): Promise<CachedAdminMapEntry[]> {
    return (await this.storageService.getAllCreatedMapsFromStorage())
      .map(result => {
        return {
          id: result[0],
          cachedAdminMapValue: result[1],
        };
      })
      .filter(
        (result: CachedAdminMapEntry) =>
          new Date(result.cachedAdminMapValue.ttl).getTime() > Date.now()
      )
      .sort(
        (a, b) =>
          new Date(b.cachedAdminMapValue.ttl).getTime() -
          new Date(a.cachedAdminMapValue.ttl).getTime()
      )
      .slice(0, 100);
  }

  /**
   * Return the current settings.
   */
  public getCachedUserSettings(): UserSettings | null {
    return this.userSettingsSubject.getValue();
  }

  /**
   * Returns the cached language, or `DEFAULT_LANGUAGE` when nothing is cached.
   * Settings written by an older version may have no `general` block, and an
   * empty language would build a malformed request url, so both fall back.
   */
  public getLanguage(): string {
    return this.getCachedUserSettings()?.general?.language || DEFAULT_LANGUAGE;
  }

  public getCachedSystemSettings(): SystemSettings | null {
    return this.systemSettingsSubject.getValue();
  }

  /**
   * Reports whether the `multiTree` feature flag lets the user create trees.
   * Returns false before the system settings load.
   */
  public isMultiTreeEnabled(): boolean {
    return this.getCachedSystemSettings()?.featureFlags.multiTree ?? false;
  }

  public getEditModeObservable(): Observable<boolean | null> {
    return this.editModeSubject.asObservable();
  }

  public setEditMode(value: boolean) {
    return this.editModeSubject.next(value);
  }

  /**
   * Return the default settings.
   */
  public async getDefaultSettings(): Promise<Settings> {
    const response = await this.httpService.get(API_URL.ROOT, '/settings');
    return await response.json();
  }
}

export function appSettingsFactory(settingsService: SettingsService) {
  return () => settingsService.init();
}
