import { Component, Input } from '@angular/core';
import { ExportNodeProperties } from '@mmp/map/types';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { CachedMapOptions } from 'src/app/shared/models/cached-map.model';
import { MmpService } from '../../../../core/services/mmp/mmp.service';

@Component({
  selector: 'teammapper-sliders-panel',
  templateUrl: './slider-panels.component.html',
  styleUrls: ['./slider-panels.component.scss'],
  standalone: false,
})
export class SliderPanelsComponent {
  @Input() public node: ExportNodeProperties;
  @Input() public editDisabled: boolean;
  public mapOptions: CachedMapOptions;

  constructor(
    public mmpService: MmpService,
    public settingsService: SettingsService
  ) {
    this.mapOptions = this.mmpService.getAdditionalMapOptions();
  }

  public updateNodeFontSize(event: any) {
    const value = parseInt(event.target.value, 10);

    this.mmpService.updateNode('fontSize', value, true);
  }

  public updateNodeImageSize(event: any) {
    const value = parseInt(event.target.value, 10);

    this.mmpService.updateNode('imageSize', value, true);
  }

  public getSettingsFontMaxSize() {
    const options: CachedMapOptions = this.mmpService.getAdditionalMapOptions();
    return options.fontMaxSize;
  }

  public getSettingsFontMinSize() {
    const options: CachedMapOptions = this.mmpService.getAdditionalMapOptions();
    return options.fontMinSize;
  }

  public getSettingsFontIncrement() {
    const options: CachedMapOptions = this.mmpService.getAdditionalMapOptions();
    return options.fontIncrement;
  }
}
