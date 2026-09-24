import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { HotkeysService } from 'angular2-hotkeys';
import { DialogAboutComponent } from 'src/app/modules/application/components/dialog-about/dialog-about.component';
import { DialogConnectionInfoComponent } from 'src/app/modules/application/components/dialog-connection-info/dialog-connection-info.component';
import { DialogImportMermaidComponent } from 'src/app/modules/application/components/dialog-import-mermaid/dialog-import-mermaid.component';
import { DialogImportAiComponent } from 'src/app/modules/application/components/dialog-import-ai/dialog-import-ai.component';
import { DialogPictogramsComponent } from 'src/app/modules/application/components/dialog-pictograms/dialog-pictograms.component';
import { DialogShareComponent } from 'src/app/modules/application/components/dialog-share/dialog-share.component';

@Injectable({
  providedIn: 'root',
})
export class DialogService {
  private dialog = inject(MatDialog);
  private hotkeysService = inject(HotkeysService);

  private disconnectModalRef: MatDialogRef<DialogConnectionInfoComponent> | null =
    null;
  private shareModalRef: MatDialogRef<DialogShareComponent> | null = null;
  private aboutModalRef: MatDialogRef<DialogAboutComponent> | null = null;
  private pictogramsModalRef: MatDialogRef<DialogPictogramsComponent> | null =
    null;
  private importMermaidModalRef: MatDialogRef<DialogImportMermaidComponent> | null =
    null;
  private importAiModalRef: MatDialogRef<DialogImportAiComponent> | null = null;

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
    if (this.aboutModalRef) return;

    // angular2-hotkeys listens on the document, so a map shortcut pressed
    // inside the dialog would act on the map behind it.
    this.hotkeysService.pause();
    this.aboutModalRef = this.dialog.open(DialogAboutComponent, {
      maxHeight: '90vh',
    });
    this.aboutModalRef.afterClosed().subscribe(() => {
      this.aboutModalRef = null;
      this.hotkeysService.unpause();
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
}
