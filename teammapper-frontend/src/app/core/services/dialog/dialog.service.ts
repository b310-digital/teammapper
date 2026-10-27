import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NavigationStart, Router } from '@angular/router';
import { HotkeysService } from 'angular2-hotkeys';
import { filter, Subscription } from 'rxjs';
import { DialogAboutComponent } from 'src/app/modules/application/components/dialog-about/dialog-about.component';
import { DialogConnectionInfoComponent } from 'src/app/modules/application/components/dialog-connection-info/dialog-connection-info.component';
import { DialogDisplayNameComponent } from 'src/app/modules/application/components/dialog-display-name/dialog-display-name.component';
import { DialogImportMermaidComponent } from 'src/app/modules/application/components/dialog-import-mermaid/dialog-import-mermaid.component';
import { DialogImportAiComponent } from 'src/app/modules/application/components/dialog-import-ai/dialog-import-ai.component';
import { DialogPictogramsComponent } from 'src/app/modules/application/components/dialog-pictograms/dialog-pictograms.component';
import { DialogSettingsComponent } from 'src/app/modules/application/components/dialog-settings/dialog-settings.component';
import { DialogShareComponent } from 'src/app/modules/application/components/dialog-share/dialog-share.component';

@Injectable({
  providedIn: 'root',
})
export class DialogService {
  private dialog = inject(MatDialog);
  private hotkeysService = inject(HotkeysService);
  private router = inject(Router);

  private disconnectModalRef: MatDialogRef<DialogConnectionInfoComponent> | null =
    null;
  private shareModalRef: MatDialogRef<DialogShareComponent> | null = null;
  private aboutModalRef: MatDialogRef<DialogAboutComponent> | null = null;
  private pictogramsModalRef: MatDialogRef<DialogPictogramsComponent> | null =
    null;
  private importMermaidModalRef: MatDialogRef<DialogImportMermaidComponent> | null =
    null;
  private importAiModalRef: MatDialogRef<DialogImportAiComponent> | null = null;
  private settingsModalRef: MatDialogRef<DialogSettingsComponent> | null = null;
  private displayNameModalRef: MatDialogRef<DialogDisplayNameComponent> | null =
    null;

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

  /**
   * Open the settings dialog over the map. Hotkeys pause as for the info
   * dialog, so typing `-` into a field removes no node. A navigation closes
   * the dialog, because deleting the open map sends the user to the start
   * page. The fixed height keeps the dialog still when the user switches
   * between tabs of different length. On a phone, styles.scss stretches the
   * panel to fill the screen.
   */
  openSettingsDialog() {
    if (this.settingsModalRef) return;

    this.hotkeysService.pause();
    const dialogRef = this.dialog.open(DialogSettingsComponent, {
      width: '800px',
      maxWidth: '95vw',
      height: '720px',
      maxHeight: '90vh',
      panelClass: 'settings-dialog-panel',
    });
    const navigation = this.closeOnNavigation(dialogRef);
    dialogRef.afterClosed().subscribe(() => {
      navigation.unsubscribe();
      this.settingsModalRef = null;
      this.hotkeysService.unpause();
    });
    this.settingsModalRef = dialogRef;
  }

  /**
   * Open the display name dialog from the client list. Hotkeys pause as for
   * the settings dialog, so a name holding `-` removes no node.
   */
  openDisplayNameDialog() {
    if (this.displayNameModalRef) return;

    this.hotkeysService.pause();
    const dialogRef = this.dialog.open(DialogDisplayNameComponent, {
      width: '400px',
      maxWidth: '95vw',
    });
    dialogRef.afterClosed().subscribe(() => {
      this.displayNameModalRef = null;
      this.hotkeysService.unpause();
    });
    this.displayNameModalRef = dialogRef;
  }

  private closeOnNavigation(dialogRef: MatDialogRef<unknown>): Subscription {
    return this.router.events
      .pipe(filter(event => event instanceof NavigationStart))
      .subscribe(() => dialogRef.close());
  }

  openShareDialog() {
    this.shareModalRef = this.dialog.open(DialogShareComponent);
  }

  closeShareDialog() {
    if (!this.shareModalRef) return;

    this.shareModalRef.close();
  }
}
