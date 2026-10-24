import { Component, Input, inject } from '@angular/core';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { MatMiniFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'teammapper-floating-buttons',
  templateUrl: './floating-buttons.component.html',
  styleUrls: ['./floating-buttons.component.scss'],
  imports: [MatMiniFabButton, MatIcon, TranslatePipe, AsyncPipe],
})
export class FloatingButtonsComponent {
  mmpService = inject(MmpService);

  @Input() public editDisabled = false;
  // Center and zoom need a map, read-only or not.
  public mapCreated$ = this.mmpService.mapCreated$;

  /** Adding a child and removing a node both need a selected node. */
  get nodeActionsDisabled(): boolean {
    return this.editDisabled || !this.mmpService.hasSelectedNode();
  }
}
