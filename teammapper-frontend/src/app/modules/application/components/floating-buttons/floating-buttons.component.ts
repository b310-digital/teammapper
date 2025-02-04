import { Component, Input } from '@angular/core';
import { MmpService } from '../../../../core/services/mmp/mmp.service';

@Component({
  selector: 'teammapper-floating-buttons',
  templateUrl: './floating-buttons.component.html',
  styleUrls: ['./floating-buttons.component.scss'],
})
export class FloatingButtonsComponent {
  @Input() public editDisabled: boolean;

  constructor(public mmpService: MmpService) {}
}
