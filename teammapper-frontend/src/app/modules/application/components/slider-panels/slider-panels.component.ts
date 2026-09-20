import { Component, Input, inject } from '@angular/core';
import { ExportNodeProperties } from '@mmp/map/types';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'teammapper-sliders-panel',
  templateUrl: './slider-panels.component.html',
  styleUrls: ['./slider-panels.component.scss'],
  imports: [MatSlider, MatSliderThumb, FormsModule, TranslatePipe],
})
export class SliderPanelsComponent {
  mmpService = inject(MmpService);

  @Input() public node: ExportNodeProperties;
  @Input() public editDisabled: boolean;

  public updateNodeFontSize(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);

    this.mmpService.updateNode('fontSize', value, true);
  }

  public updateNodeImageSize(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);

    this.mmpService.updateNode('imageSize', value, true);
  }

  public getSettingsFontMaxSize() {
    return this.mmpService.getAdditionalMapOptions().fontMaxSize;
  }

  public getSettingsFontMinSize() {
    return this.mmpService.getAdditionalMapOptions().fontMinSize;
  }

  public getSettingsFontIncrement() {
    return this.mmpService.getAdditionalMapOptions().fontIncrement;
  }
}
