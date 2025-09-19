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
  ];

  public userSettings: Observable<UserSettings | null>;
  private userSettingsSubject: BehaviorSubject<UserSettings | null>;
  private systemSettingsSubject: BehaviorSubject<SystemSettings | null>;
  private readonly editModeSubject: BehaviorSubject<boolean | null>;

  constructor() {
    // Initialization of the behavior subjects.
    this.userSettingsSubject = new BehaviorSubject(null);
    this.systemSettingsSubject = new BehaviorSubject(null);
    this.editModeSubject = new BehaviorSubject(null);
    this.userSettings = this.userSettingsSubject.asObservable();
  }

  /**
   * Initialize settings with the default or cached values and return them.
   */
  public async init() {
    const defaultSettings: Settings = await this.getDefaultSettings();
    defaultSettings.userSettings.general.language =
      this.translateService.getBrowserLang() ??
      defaultSettings.userSettings.general.language;
    const loadedSettings: UserSettings = await this.storageService.get(
      STORAGE_KEYS.SETTINGS
    );
    const userSettings = loadedSettings || defaultSettings.userSettings;

    // Save the default settings.
    await this.storageService.set(STORAGE_KEYS.SETTINGS, userSettings);
    this.userSettingsSubject.next(userSettings);
    this.systemSettingsSubject.next(defaultSettings.systemSettings);
    return true;
  }

  /**
   * Update the settings in the storage.
   */
  public async updateCachedSettings(settings: UserSettings): Promise<void> {
    await this.storageService.set(STORAGE_KEYS.SETTINGS, settings);
    this.userSettingsSubject.next(settings);
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
