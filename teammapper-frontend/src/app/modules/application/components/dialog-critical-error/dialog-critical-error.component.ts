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
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Data passed to critical error dialog component
 */
export interface CriticalErrorData {
  code: string;
  message: string;
}

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
    TranslatePipe,
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
