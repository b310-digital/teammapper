import { Component, Input, inject } from '@angular/core';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { MatMiniFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AsyncPipe } from '@angular/common';
import { StopArrowModeDirective } from '../../../../shared/directives/stop-arrow-mode.directive';

@Component({
  selector: 'teammapper-floating-buttons',
  templateUrl: './floating-buttons.component.html',
  styleUrls: ['./floating-buttons.component.scss'],
  imports: [
    MatMiniFabButton,
    MatIcon,
    TranslatePipe,
    AsyncPipe,
    StopArrowModeDirective,
  ],
})
export class FloatingButtonsComponent {
  mmpService = inject(MmpService);

  @Input() public editDisabled = false;
  // Center and zoom need a map, read-only or not.
  public mapCreated$ = this.mmpService.mapCreated$;

  /** Adding a child needs a selected node. */
  get nodeActionsDisabled(): boolean {
    return this.editDisabled || !this.mmpService.hasSelectedNode();
  }

  /** Removing needs a selected node or a selected arrow. */
  get removeDisabled(): boolean {
    const selected =
      this.mmpService.hasSelectedNode() || this.mmpService.hasSelectedArrow();
    return this.editDisabled || !selected;
  }
}
