import { Component } from '@angular/core'
import { Settings } from '../../../../shared/models/settings.model'
import { SettingsService } from '../../../../core/services/settings/settings.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'
import { TranslateService } from '@ngx-translate/core'
import { Location } from '@angular/common'
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service'
import { CachedMapOptions } from 'src/app/shared/models/cached-map.model'

@Component({
  selector: 'teammapper-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  public readonly languages: string[]
  public settings: Settings
  public mapOptions: CachedMapOptions

  constructor (
    private settingsService: SettingsService,
    private mmpService: MmpService,
    private mapSyncService: MapSyncService,
    private translateService: TranslateService,
    private location: Location) {
    this.languages = SettingsService.LANGUAGES
    this.settings = this.settingsService.getCachedSettings()
    this.mapOptions = this.mmpService.getAdditionalMapOptions()
  }

  public async updateGeneralMapOptions() {
    await this.settingsService.updateCachedSettings(this.settings)

    this.mmpService.updateOptions('rootNode', this.settings.mapOptions.rootNode)
    this.mmpService.updateOptions('defaultNode', this.settings.mapOptions.defaultNode)
    this.mmpService.updateOptions('centerOnResize', this.settings.mapOptions.centerOnResize)
  }

  public async updateMapOptions () {
    this.validateMapOptionsInput()
    // Update locally
    this.mmpService.updateAdditionalMapOptions(this.mapOptions)
    // Sync to other users
    this.mapSyncService.updateMapOptions(this.mapOptions)
  }

  public async updateLanguage () {
    await this.settingsService.updateCachedSettings(this.settings)

    this.translateService.use(this.settings.general.language)
  }

  public back () {
    this.location.back()
  }

  private validateMapOptionsInput() {
    if(this.mapOptions.fontIncrement > this.mapOptions.fontMaxSize || this.mapOptions.fontIncrement < 1) this.mapOptions.fontIncrement = 5
    if(this.mapOptions.fontMaxSize > 99 || this.mapOptions.fontMaxSize < 15) this.mapOptions.fontMaxSize = 70
    if(this.mapOptions.fontMinSize > 99 || this.mapOptions.fontMinSize < 15) this.mapOptions.fontMinSize = 15
  }
}
