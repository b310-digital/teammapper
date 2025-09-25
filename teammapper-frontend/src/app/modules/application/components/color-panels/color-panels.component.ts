import {
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { ExportNodeProperties } from '@mmp/map/types';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { NgIf } from '@angular/common';
import { ColorPickerModule } from 'ngx-color-picker';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'teammapper-colors-panel',
  templateUrl: './color-panels.component.html',
  styleUrls: ['./color-panels.component.scss'],
  imports: [NgIf, ColorPickerModule, TranslatePipe],
})
export class ColorPanelsComponent implements OnInit {
  mmpService = inject(MmpService);

  @Input() public node: ExportNodeProperties;
  @Input() public editDisabled: boolean;

  @ViewChild('background') public background: ElementRef;

  public options: any;

  ngOnInit() {
    this.options = {
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
  }

  public colorPickerChange(property, value) {
    this.mmpService.updateNode(property, value, true);
  }

  public colorPickerToggleChange(opening, property, value) {
    this.background.nativeElement.style.visibility = opening
      ? 'visible'
      : 'hidden';

    if (!opening) {
      this.mmpService.updateNode(property, value);
    }
  }
}
