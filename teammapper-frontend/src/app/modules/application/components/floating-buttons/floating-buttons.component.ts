import { Component, Input, inject } from '@angular/core';
import { MmpService } from '../../../../core/services/mmp/mmp.service';

@Component({
  selector: 'teammapper-floating-buttons',
  templateUrl: './floating-buttons.component.html',
  styleUrls: ['./floating-buttons.component.scss'],
  standalone: false,
})
export class FloatingButtonsComponent {
  mmpService = inject(MmpService);

  @Input() public editDisabled: boolean;
}
