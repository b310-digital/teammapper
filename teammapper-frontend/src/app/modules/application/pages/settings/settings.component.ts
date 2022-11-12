import { Component } from '@angular/core'
import { Settings } from '../../../../shared/models/settings.model'
import { SettingsService } from '../../../../core/services/settings/settings.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'
import { TranslateService } from '@ngx-translate/core'
import { Location } from '@angular/common'

@Component({
  selector: 'teammapper-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  public readonly languages: string[]
  public settings: Settings

  constructor (private settingsService: SettingsService,
    private mmpService: MmpService,
    private translateService: TranslateService,
    private location: Location) {
    this.languages = SettingsService.LANGUAGES
    this.settings = this.settingsService.getCachedSettings()
  }

  public async updateMapOptions () {
    if(this.settings.mapOptions.fontIncrement > this.settings.mapOptions.fontMaxSize || this.settings.mapOptions.fontIncrement < 1) this.settings.mapOptions.fontIncrement = 5
    if(this.settings.mapOptions.fontMaxSize > 99 || this.settings.mapOptions.fontMaxSize < 15) this.settings.mapOptions.fontMaxSize = 70
    if(this.settings.mapOptions.fontMinSize > 99 || this.settings.mapOptions.fontMinSize < 15) this.settings.mapOptions.fontMinSize = 15

    await this.settingsService.updateCachedSettings(this.settings)

    this.mmpService.updateOptions('rootNode', this.settings.mapOptions.rootNode)
    this.mmpService.updateOptions('defaultNode', this.settings.mapOptions.defaultNode)
    this.mmpService.updateOptions('centerOnResize', this.settings.mapOptions.centerOnResize)
  }

  public async updateLanguage () {
    await this.settingsService.updateCachedSettings(this.settings)

    this.translateService.use(this.settings.general.language)
  }

  public back () {
    this.location.back()
  }
}
