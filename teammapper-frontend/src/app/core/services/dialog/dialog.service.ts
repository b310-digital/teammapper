import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DialogAboutComponent } from 'src/app/modules/application/components/dialog-about/dialog-about.component';
import { DialogConnectionInfoComponent } from 'src/app/modules/application/components/dialog-connection-info/dialog-connection-info.component';
import { DialogImportMermaidComponent } from 'src/app/modules/application/components/dialog-import-mermaid/dialog-import-mermaid.component';
import { DialogImportAiComponent } from 'src/app/modules/application/components/dialog-import-ai/dialog-import-ai.component';
import { DialogPictogramsComponent } from 'src/app/modules/application/components/dialog-pictograms/dialog-pictograms.component';
import { DialogShareComponent } from 'src/app/modules/application/components/dialog-share/dialog-share.component';
import { DialogCriticalErrorComponent } from 'src/app/modules/application/components/dialog-critical-error/dialog-critical-error.component';
import { CriticalErrorData } from 'src/app/shared/models/error-types.model';

@Injectable({
  providedIn: 'root',
})
export class DialogService {
  private dialog = inject(MatDialog);

  private disconnectModalRef: MatDialogRef<DialogConnectionInfoComponent>;
  private shareModalRef: MatDialogRef<DialogShareComponent>;
  private aboutModalRef: MatDialogRef<DialogAboutComponent>;
  private pictogramsModalRef: MatDialogRef<DialogPictogramsComponent>;
  private importMermaidModalRef: MatDialogRef<DialogImportMermaidComponent>;
  private importAiModalRef: MatDialogRef<DialogImportAiComponent>;
  private criticalErrorModalRef: MatDialogRef<DialogCriticalErrorComponent>;

  openPictogramDialog() {
    this.pictogramsModalRef = this.dialog.open(DialogPictogramsComponent);
    this.pictogramsModalRef.componentInstance.onPictogramAdd.subscribe(() => {
      this.closePictogramDialog();
    });
  }

  closePictogramDialog() {
    if (!this.pictogramsModalRef) return;

    this.pictogramsModalRef.close();
  }

  openImportMermaidDialog() {
    this.importMermaidModalRef = this.dialog.open(DialogImportMermaidComponent);
  }

  closeImportMermaidDialog() {
    if (!this.importMermaidModalRef) return;

    this.importMermaidModalRef.close();
  }

  openImportAiDialog() {
    this.importAiModalRef = this.dialog.open(DialogImportAiComponent);
  }

  closeImportAiDialog() {
    if (!this.importAiModalRef) return;

    this.importAiModalRef.close();
  }

  openDisconnectDialog() {
    this.disconnectModalRef = this.dialog.open(DialogConnectionInfoComponent);
  }

  closeDisconnectDialog() {
    if (!this.disconnectModalRef) return;

    this.disconnectModalRef.close();
  }

  openAboutDialog() {
    this.aboutModalRef = this.dialog.open(DialogAboutComponent, {
      maxHeight: '90vh',
    });
  }

  closeAboutDialog() {
    if (!this.aboutModalRef) return;

    this.aboutModalRef.close();
  }

  openShareDialog() {
    this.shareModalRef = this.dialog.open(DialogShareComponent);
  }

  closeShareDialog() {
    if (!this.shareModalRef) return;

    this.shareModalRef.close();
  }

  /**
   * Open critical error dialog
   * This modal is blocking and cannot be dismissed except by reloading the page
   * @param errorData Critical error data to display
   * @returns Dialog reference
   */
  openCriticalErrorDialog(
    errorData: CriticalErrorData
  ): MatDialogRef<DialogCriticalErrorComponent> {
    // Only open one critical error dialog at a time
    if (this.criticalErrorModalRef) {
      return this.criticalErrorModalRef;
    }

    this.criticalErrorModalRef = this.dialog.open(
      DialogCriticalErrorComponent,
      {
        data: errorData,
        disableClose: true, // Prevent closing by clicking outside or pressing escape
        hasBackdrop: true,
        backdropClass: 'critical-error-backdrop',
        panelClass: 'critical-error-dialog',
      }
    );

    return this.criticalErrorModalRef;
  }
}
