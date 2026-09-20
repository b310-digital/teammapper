import { Component, Input, OnChanges, inject } from '@angular/core';
import { ExportNodeProperties } from '@teammapper/shared';
import {
  AdditionalMapOptions,
  MmpService,
} from '../../../../core/services/mmp/mmp.service';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'teammapper-sliders-panel',
  templateUrl: './slider-panels.component.html',
  styleUrls: ['./slider-panels.component.scss'],
  imports: [MatSlider, MatSliderThumb, FormsModule, TranslatePipe],
})
export class SliderPanelsComponent implements OnChanges {
  mmpService = inject(MmpService);

  @Input() public node: ExportNodeProperties | null = null;
  @Input() public editDisabled: boolean;

  /**
   * The sizes of the node with a resolved value, since a slider needs a
   * number. The sliders write their live value back here, and only MmpService
   * changes the node itself.
   */
  public fontSize = 0;
  public imageSize = 0;

  /** The font bounds of the open map, absent until one has been created. */
  public mapOptions: AdditionalMapOptions | null = null;

  ngOnChanges() {
    this.fontSize = this.node?.font?.size ?? 0;
    this.imageSize = this.node?.image?.size ?? 0;
    this.mapOptions = this.mmpService.getAdditionalMapOptions();
  }

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
}
