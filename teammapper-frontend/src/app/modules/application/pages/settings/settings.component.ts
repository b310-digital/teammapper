import { Component, OnInit } from '@angular/core'
import { Settings } from '../../../../shared/models/settings.model'
import { SettingsService } from '../../../../core/services/settings/settings.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'
import { TranslateService } from '@ngx-translate/core'
import { Location } from '@angular/common'
import { Router } from '@angular/router'
import { Observable } from 'rxjs';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service'
import { CachedAdminMapEntry, CachedMapOptions } from 'src/app/shared/models/cached-map.model'

@Component({
  selector: 'teammapper-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  public readonly languages: string[]
  public settings: Settings
  public mapOptions: CachedMapOptions
  public editMode: Observable<boolean>
  public cachedAdminMapEntries: CachedAdminMapEntry[]

  constructor (
    private settingsService: SettingsService,
    private mmpService: MmpService,
    private mapSyncService: MapSyncService,
    private translateService: TranslateService,
    private router: Router,
    private location: Location) {
    this.languages = SettingsService.LANGUAGES
    this.settings = this.settingsService.getCachedSettings()
    this.mapOptions = this.mmpService.getAdditionalMapOptions()
    this.editMode = this.settingsService.getEditModeObservable()
    this.cachedAdminMapEntries = []
  }

  public async updateGeneralMapOptions() {
    await this.settingsService.updateCachedSettings(this.settings)
  }

  public async ngOnInit () {
    this.cachedAdminMapEntries = await this.settingsService.getCachedAdminMapEntries()
  }

  public async updateMapOptions () {
    await this.validateMapOptionsInput()
    this.mapSyncService.updateMapOptions(this.mapOptions)
  }

  public async updateLanguage () {
    await this.settingsService.updateCachedSettings(this.settings)

    this.translateService.use(this.settings.general.language)
  }

  public back () {
    this.location.back()
  }

  public getMapUrl (entry: CachedAdminMapEntry): string {
    return this.router.createUrlTree([`/map/${entry.id}`], {fragment: entry.cachedAdminMapValue.modificationSecret}).toString()
  }

  public getMapTitle (entry: CachedAdminMapEntry): string {
    return entry.cachedAdminMapValue.rootName || entry.id
  }

  private async validateMapOptionsInput() {
    const defaultSettings: Settings = await this.settingsService.getDefaultSettings();
    if(this.mapOptions.fontIncrement > this.mapOptions.fontMaxSize || this.mapOptions.fontIncrement < 1) this.mapOptions.fontIncrement = defaultSettings.mapOptions.fontIncrement
    if(this.mapOptions.fontMaxSize > 99 || this.mapOptions.fontMaxSize < 15) this.mapOptions.fontMaxSize = defaultSettings.mapOptions.fontMaxSize
    if(this.mapOptions.fontMinSize > 99 || this.mapOptions.fontMinSize < 15) this.mapOptions.fontMinSize = defaultSettings.mapOptions.fontMinSize
  }
}
