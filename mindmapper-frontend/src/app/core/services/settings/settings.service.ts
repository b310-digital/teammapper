import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { Settings } from '../../../shared/models/settings.model'
import { API_URL, HttpService } from '../../http/http.service'
import { StorageService, STORAGE_KEYS } from '../storage/storage.service'

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  public static readonly LANGUAGES = ['en', 'fr', 'de', 'it', 'zh-tw', 'zh-cn', 'es', 'pt-br']

  public settings: Observable<Settings | null>
  private settingsSubject: BehaviorSubject<Settings | null>

  constructor(private storageService: StorageService,
    private httpService: HttpService) {
    // Initialization of the behavior subjects.
    this.settingsSubject = new BehaviorSubject(null)
    this.settings = this.settingsSubject.asObservable()
  }

  /**
     * Initialize settings with the default or cached values and return them.
     */
  public async init() {
    return new Promise(async (resolve, reject) => {
      const defaultSettings: Settings = await this.getDefaultSettings()
      const loadedSettings: Settings = await this.storageService.get(STORAGE_KEYS.SETTINGS)
      const settings = loadedSettings || defaultSettings

      // Save the default settings.
      await this.storageService.set(STORAGE_KEYS.SETTINGS, settings)
      this.settingsSubject.next(settings)

      resolve(true)
    })
  }

  /**
     * Update the settings in the storage.
     */
  public async updateCachedSettings(settings: Settings): Promise<void> {
    await this.storageService.set(STORAGE_KEYS.SETTINGS, settings)

    this.settingsSubject.next(settings)
  }

  /**
     * Return the current settings.
     */
  public getCachedSettings(): Settings | null {
    return this.settingsSubject.getValue()
  }

  /**
     * Return the default settings.
     */
  private async getDefaultSettings(): Promise<Settings> {
    const response = await this.httpService.get(API_URL.LOCAL_ASSETS, 'settings.json')
    return response.json()
  }

}

export function appSettingsFactory (settingsService: SettingsService) {
  return () => settingsService.init()
}