import { Component, Input } from '@angular/core'
import { SettingsService } from 'src/app/core/services/settings/settings.service'
import { CachedMapOptions } from 'src/app/shared/models/cached-map.model'
import { MmpService } from '../../../../core/services/mmp/mmp.service'

@Component({
  selector: 'teammapper-sliders-panel',
  templateUrl: './slider-panels.component.html',
  styleUrls: ['./slider-panels.component.scss']
})
export class SliderPanelsComponent {
  @Input() public node: any
  public mapOptions: CachedMapOptions

  constructor (public mmpService: MmpService,
    public settingsService: SettingsService) {
    this.mapOptions = this.mmpService.getAdditionalMapOptions()
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
    const options: CachedMapOptions = this.mmpService.getAdditionalMapOptions()
    return options.fontMaxSize
  }

  public getSettingsFontMinSize() {
    const options: CachedMapOptions = this.mmpService.getAdditionalMapOptions()
    return options.fontMinSize
  }

  public getSettingsFontIncrement() {
    const options: CachedMapOptions = this.mmpService.getAdditionalMapOptions()
    return options.fontIncrement
  }
}
