import { DestroyRef, Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CachedAdminMapEntry,
  normalizeDisplayName,
  Settings,
  SUPPORTED_LANGUAGES,
  SystemSettings,
  UserMapOptions,
  UserSettings,
} from '@teammapper/shared';
import { API_URL, HttpService } from '../../http/http.service';
import { STORAGE_KEYS, StorageService } from '../storage/storage.service';

/** `getLanguage` returns this when no user settings are cached. */
const DEFAULT_LANGUAGE = 'en';

/**
 * Name of the channel that carries settings changes to the other open tabs of
 * the same browser. Storage writes go to IndexedDB, which notifies no tab.
 */
export const SETTINGS_CHANNEL = 'teammapper-settings';

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
  private readonly channel = openSettingsChannel();

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
    this.listenToOtherTabs();
  }

  /**
   * Apply the settings another tab saved. That tab already stored them, so
   * this tab only updates its cache, which keeps a later save here from
   * writing the old values back.
   */
  private listenToOtherTabs(): void {
    const channel = this.channel;
    if (!channel) return;
    // zone.js patches addEventListener, so Angular renders the change.
    channel.addEventListener('message', (event: MessageEvent<UserSettings>) => {
      this.userSettingsSubject.next(withDisplayName(event.data));
      this.applyDarkMode(event.data.general.darkMode);
    });
    inject(DestroyRef).onDestroy(() => channel.close());
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
      return withDisplayName(defaults);
    }
    if (loaded.general.darkMode === undefined) {
      loaded.general.darkMode = this.getSystemDarkModePreference();
    }
    return withDisplayName(loaded);
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
        this.userSettingsSubject.next(withDisplayName(cached));
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
   * Update the settings in the storage and in the other open tabs.
   */
  public async updateCachedSettings(settings: UserSettings): Promise<void> {
    await this.storageService.set(STORAGE_KEYS.SETTINGS, settings);
    this.userSettingsSubject.next(settings);
    this.applyDarkMode(settings.general.darkMode);
    this.channel?.postMessage(settings);
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

  /**
   * Store the normalized display name. A name of whitespace only clears it.
   */
  public async setDisplayName(value: string): Promise<void> {
    const settings = this.getCachedUserSettings();
    if (!settings) return;

    settings.general.displayName = normalizeDisplayName(value);
    await this.updateCachedSettings(settings);
  }

  /**
   * Store the language in the latest settings, which may hold changes another
   * tab made after the caller read its copy.
   */
  public async setLanguage(language: string): Promise<void> {
    const settings = this.getCachedUserSettings();
    if (!settings) return;

    settings.general.language = language;
    await this.updateCachedSettings(settings);
  }

  /** Store the map options in the latest settings, as `setLanguage` does. */
  public async setUserMapOptions(mapOptions: UserMapOptions): Promise<void> {
    const settings = this.getCachedUserSettings();
    if (!settings) return;

    settings.mapOptions = mapOptions;
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

/**
 * The settings with a normalized display name. Settings stored by an older
 * version hold none, which leaves the user without a display name.
 */
function withDisplayName(settings: UserSettings): UserSettings {
  if (settings.general) {
    settings.general.displayName = normalizeDisplayName(
      settings.general.displayName
    );
  }
  return settings;
}

/** The settings channel, or null in an environment without one. */
function openSettingsChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(SETTINGS_CHANNEL);
}

export function appSettingsFactory(settingsService: SettingsService) {
  return () => settingsService.init();
}
