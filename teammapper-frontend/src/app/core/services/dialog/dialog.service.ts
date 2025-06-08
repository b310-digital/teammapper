import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DialogAboutComponent } from 'src/app/modules/application/components/dialog-about/dialog-about.component';
import { DialogConnectionInfoComponent } from 'src/app/modules/application/components/dialog-connection-info/dialog-connection-info.component';
import { DialogImportMermaidComponent } from 'src/app/modules/application/components/dialog-import-mermaid/dialog-import-mermaid.component';
import { DialogPictogramsComponent } from 'src/app/modules/application/components/dialog-pictograms/dialog-pictograms.component';
import { DialogShareComponent } from 'src/app/modules/application/components/dialog-share/dialog-share.component';

@Injectable({
  providedIn: 'root',
})
export class DialogService {
  private disconnectModalRef: MatDialogRef<DialogConnectionInfoComponent>;
  private shareModalRef: MatDialogRef<DialogShareComponent>;
  private aboutModalRef: MatDialogRef<DialogAboutComponent>;
  private pictogramsModalRef: MatDialogRef<DialogPictogramsComponent>;
  private importMermaidModalRef: MatDialogRef<DialogImportMermaidComponent>;

  constructor(private dialog: MatDialog) {}

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
}
