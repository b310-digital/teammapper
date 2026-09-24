import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  inject,
  viewChild,
} from '@angular/core';
import { NodeColors } from '@teammapper/mmp';
import {
  ExportNodeProperties,
  MapNodeColors,
  NodeProperty,
} from '@teammapper/shared';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { ColorPickerDirective } from 'ngx-color-picker';
import { TranslatePipe } from '@ngx-translate/core';

const resolveColors = (colors?: MapNodeColors | null): NodeColors => ({
  name: colors?.name ?? '',
  background: colors?.background ?? '',
  branch: colors?.branch ?? '',
  link: colors?.link ?? '',
});

@Component({
  selector: 'teammapper-colors-panel',
  templateUrl: './color-panels.component.html',
  styleUrls: ['./color-panels.component.scss'],
  imports: [ColorPickerDirective, TranslatePipe],
})
export class ColorPanelsComponent implements OnChanges {
  mmpService = inject(MmpService);

  @Input() public node: ExportNodeProperties | null = null;
  @Input() public editDisabled = false;

  public readonly background =
    viewChild.required<ElementRef<HTMLElement>>('background');

  public readonly options = {
    width: '250px',
    presetColors: [
      '#666666',
      '#f5f5f5',
      '#f44336',
      '#E91E63',
      '#9C27B0',
      '#673AB7',
      '#3F51B5',
      '#2196F3',
      '#03A9F4',
      '#00BCD4',
      '#009688',
      '#4CAF50',
      '#8BC34A',
      '#CDDC39',
      '#FFEB3B',
      '#FFC107',
      '#FF9800',
      '#FF5722',
      '#795548',
      '#9E9E9E',
      '#607D8B',
    ],
  };

  /**
   * The colors of the node with every value resolved, since a color picker
   * needs a string. The pickers write their live value back here, and only
   * MmpService changes the node itself.
   */
  public colors: NodeColors = resolveColors();

  ngOnChanges() {
    this.colors = resolveColors(this.node?.colors);
  }

  public colorPickerChange(property: NodeProperty, value: string) {
    this.mmpService.updateNode(property, value, true);
  }

  public colorPickerToggleChange(
    opening: boolean,
    property: NodeProperty,
    value: string
  ) {
    this.background().nativeElement.style.visibility = opening
      ? 'visible'
      : 'hidden';

    if (!opening) {
      this.mmpService.updateNode(property, value);
    }
  }
}
