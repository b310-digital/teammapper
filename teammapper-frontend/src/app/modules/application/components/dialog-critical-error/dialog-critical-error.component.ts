import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CriticalErrorData } from '../../../../shared/models/error-types.model';

/**
 * Critical Error Dialog Component
 * Displays a blocking modal for critical errors that require page reload
 * Cannot be dismissed by clicking outside or pressing escape
 */
@Component({
  selector: 'teammapper-dialog-critical-error',
  templateUrl: './dialog-critical-error.component.html',
  styleUrls: ['./dialog-critical-error.component.scss'],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatIcon,
  ],
})
export class DialogCriticalErrorComponent {
  public dialogRef =
    inject<MatDialogRef<DialogCriticalErrorComponent>>(MatDialogRef);
  public data = inject<CriticalErrorData>(MAT_DIALOG_DATA);

  constructor() {
    // Prevent closing dialog by clicking outside or pressing escape
    this.dialogRef.disableClose = true;
  }

  /**
   * Reload the page to recover from critical error
   */
  reloadPage(): void {
    window.location.reload();
  }
}
