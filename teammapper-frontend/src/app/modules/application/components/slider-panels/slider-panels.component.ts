import { Component, Input } from '@angular/core'
import { SettingsService } from 'src/app/core/services/settings/settings.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'

@Component({
  selector: 'teammapper-sliders-panel',
  templateUrl: './slider-panels.component.html',
  styleUrls: ['./slider-panels.component.scss']
})
export class SliderPanelsComponent {
  @Input() public node: any

  constructor (public mmpService: MmpService, public settingsService: SettingsService) {
  }

  public updateNodeFontSize (event: any, graphic?: boolean) {
    const value = parseInt(event.source.value, 10)

    this.mmpService.updateNode('fontSize', value, graphic)
  }

  public updateNodeImageSize (event: any, graphic?: boolean) {
    const value = parseInt(event.source.value, 10)

    this.mmpService.updateNode('imageSize', value, graphic)
  }

  public getSettingsFontMaxSize() {
    const settings = this.settingsService.getCachedSettings()
    return settings.mapOptions.fontMaxSize
  }

  public getSettingsFontMinSize() {
    const settings = this.settingsService.getCachedSettings()
    return settings.mapOptions.fontMinSize
  }

  public getSettingsFontIncrement() {
    const settings = this.settingsService.getCachedSettings()
    return settings.mapOptions.fontIncrement
  }
}
