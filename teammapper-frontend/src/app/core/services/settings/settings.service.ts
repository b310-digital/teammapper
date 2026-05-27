import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CachedAdminMapEntry } from 'src/app/shared/models/cached-map.model';
import {
  Settings,
  SystemSettings,
  UserSettings,
} from '../../../shared/models/settings.model';
import { API_URL, HttpService } from '../../http/http.service';
import { STORAGE_KEYS, StorageService } from '../storage/storage.service';

@Injectable({
  providedIn: 'root',
})
// Global per user settings service
export class SettingsService {
  private storageService = inject(StorageService);
  private httpService = inject(HttpService);
  private translateService = inject(TranslateService);

  public static readonly LANGUAGES = [
    'en',
    'fr',
    'de',
    'it',
    'zh-tw',
    'zh-cn',
    'es',
    'pt-br',
    'ja',
  ];

  public userSettings: Observable<UserSettings | null>;
  private userSettingsSubject: BehaviorSubject<UserSettings | null>;
  private systemSettingsSubject: BehaviorSubject<SystemSettings | null>;
  private readonly editModeSubject: BehaviorSubject<boolean | null>;
  private readonly darkModeSubject: BehaviorSubject<boolean>;
  public readonly darkMode: Observable<boolean>;

  constructor() {
    // Initialization of the behavior subjects.
    this.userSettingsSubject = new BehaviorSubject(null);
    this.systemSettingsSubject = new BehaviorSubject(null);
    this.editModeSubject = new BehaviorSubject(null);
    this.darkModeSubject = new BehaviorSubject(false);
    this.userSettings = this.userSettingsSubject.asObservable();
    this.darkMode = this.darkModeSubject.asObservable();
  }

  /**
   * Initialize dark mode from system preference if no user setting exists.
   */
  private getSystemDarkModePreference(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Initialize settings with the default or cached values and return them.
   */
  public async init() {
    const defaultSettings: Settings = await this.getDefaultSettings();
    defaultSettings.userSettings.general.language =
      this.translateService.getBrowserLang() ??
      defaultSettings.userSettings.general.language;
    const loadedSettings = (await this.storageService.get(
      STORAGE_KEYS.SETTINGS
    )) as UserSettings | null;

    if (!loadedSettings) {
      defaultSettings.userSettings.general.darkMode =
        this.getSystemDarkModePreference();
    }

    const userSettings = loadedSettings || defaultSettings.userSettings;

    // Save the default settings.
    await this.storageService.set(STORAGE_KEYS.SETTINGS, userSettings);
    this.userSettingsSubject.next(userSettings);
    this.applyDarkMode(userSettings.general.darkMode);
    this.systemSettingsSubject.next(defaultSettings.systemSettings);
    return true;
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
  private applyDarkMode(isDark: boolean) {
    if (isDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
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

export function appSettingsFactory(settingsService: SettingsService) {
  return () => settingsService.init();
}
