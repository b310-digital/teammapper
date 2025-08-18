import { Component, Input } from '@angular/core';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { MatMiniFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'teammapper-floating-buttons',
  templateUrl: './floating-buttons.component.html',
  styleUrls: ['./floating-buttons.component.scss'],
  imports: [MatMiniFabButton, MatIcon, TranslatePipe],
})
export class FloatingButtonsComponent {
  @Input() public editDisabled: boolean;

  constructor(public mmpService: MmpService) {}
}
