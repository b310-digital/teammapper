import { Component, Input, inject, OnDestroy } from '@angular/core';
import { ExportNodeProperties } from '@mmp/map/types';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { NgClass } from '@angular/common';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'teammapper-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
  imports: [
    MatToolbar,
    RouterLink,
    MatIconButton,
    MatIcon,
    MatMenuTrigger,
    MatMenu,
    MatMenuItem,
    NgClass,
    TranslatePipe,
  ],
})
export class ToolbarComponent implements OnDestroy {
  private translationService = inject(TranslateService);
  mmpService = inject(MmpService);
  private mapSyncService = inject(MapSyncService);
  private dialogService = inject(DialogService);
  private settingsService = inject(SettingsService);

  @Input() public node: ExportNodeProperties;
  @Input() public editDisabled: boolean;
  public featureFlagPictograms: boolean;
  public featureFlagAI: boolean;
  public readonly yjsEnabled: boolean;

  private canUndo = false;
  private canRedo = false;
  private undoRedoSubscriptions: Subscription[] = [];

  constructor() {
    this.featureFlagPictograms =
      this.settingsService.getCachedSystemSettings()?.featureFlags?.pictograms;
    this.yjsEnabled =
      this.settingsService.getCachedSystemSettings()?.featureFlags?.yjs ??
      false;

    if (this.yjsEnabled) {
      this.undoRedoSubscriptions.push(
        this.mapSyncService.canUndo$.subscribe(v => (this.canUndo = v)),
        this.mapSyncService.canRedo$.subscribe(v => (this.canRedo = v))
      );
    }
  }

  ngOnDestroy(): void {
    this.undoRedoSubscriptions.forEach(s => s.unsubscribe());
  }

  public async exportMap(format: string) {
    const result = await this.mmpService.exportMap(format);
    if (result.size > 1000 && format === 'json')
      alert(
        this.translationService.instant('MESSAGES.JSON_FILE_SIZE_TOO_LARGE')
      );
  }

  get hasHiddenNodes() {
    return (
      this.mmpService.nodeChildren()?.filter(node => node.hidden).length > 0
    );
  }

  // In some cases the mmpService is not yet initialized so trying to call getSelectedNode() will throw an error
  get canHideNodes() {
    if (this.mmpService) {
      const selectedNode = this.mmpService.getSelectedNode();
      return selectedNode && !selectedNode.isRoot;
    }
  }

  get canYjsUndo() {
    return this.yjsEnabled && this.canUndo;
  }

  get canYjsRedo() {
    return this.yjsEnabled && this.canRedo;
  }

  get canUndoRedo() {
    if (this.yjsEnabled) {
      return this.canUndo || this.canRedo;
    }
    if (this.mmpService && typeof this.mmpService.history === 'function') {
      const history = this.mmpService.history();
      return history?.snapshots?.length > 1;
    }
    return false;
  }

  public handleUndo(): void {
    if (this.yjsEnabled) {
      this.mapSyncService.undo();
    } else {
      this.mmpService.undo();
    }
  }

  public handleRedo(): void {
    if (this.yjsEnabled) {
      this.mapSyncService.redo();
    } else {
      this.mmpService.redo();
    }
  }

  public async share() {
    this.dialogService.openShareDialog();
  }

  public async mermaid() {
    this.dialogService.openImportMermaidDialog();
  }

  public async importFromAi() {
    this.dialogService.openImportAiDialog();
  }

  public async pictogram() {
    this.dialogService.openPictogramDialog();
  }

  public toogleNodeFontStyle() {
    const currentStyle = this.mmpService.selectNode().font.style;

    if (currentStyle === 'italic') {
      this.mmpService.updateNode('fontStyle', 'normal');
    } else {
      this.mmpService.updateNode('fontStyle', 'italic');
    }
  }

  public addLink() {
    const linkInput = prompt(
      this.translationService.instant('MODALS.LINK.URL')
    );
    if (this.isValidLink(linkInput)) this.mmpService.addNodeLink(linkInput);
  }

  public addDetachedNode() {
    this.mmpService.addNode({ detached: true, name: '' });
  }

  public removeLink() {
    this.mmpService.removeNodeLink();
  }

  public toogleNodeFontWeight() {
    const currentWeight = this.mmpService.selectNode().font.weight;

    if (currentWeight === 'bold') {
      this.mmpService.updateNode('fontWeight', 'normal');
    } else {
      this.mmpService.updateNode('fontWeight', 'bold');
    }
  }

  public async openAbout() {
    this.dialogService.openAboutDialog();
  }

  public initImageUpload(event: InputEvent) {
    const fileReader = new FileReader();

    fileReader.onload = (_fileEvent: Event) => {
      // in case file is an image resize it
      const img = new Image(); // create a image
      img.src = fileReader.result.toString(); // result is base64-encoded Data URI
      img.onload = (el: Event) => {
        const resizeWidth = 360; // without px
        const elem = document.createElement('canvas'); // create a canvas

        const target = el.target as HTMLImageElement;
        // scale the image to 360 (width) and keep aspect ratio
        const scaleFactor = resizeWidth / target.width;
        elem.width = resizeWidth;
        elem.height = target.height * scaleFactor;

        // draw in canvas
        const ctx = elem.getContext('2d');
        ctx.drawImage(target, 0, 0, elem.width, elem.height);

        // get the base64-encoded Data URI from the resize image
        this.mmpService.addNodeImage(ctx.canvas.toDataURL('image/jpeg', 0.5));
      };
    };
    const fileUpload: HTMLInputElement = event.target as HTMLInputElement;
    fileReader.readAsDataURL(fileUpload.files[0]);
  }

  public initJSONUpload(event: InputEvent) {
    const fileReader = new FileReader();

    fileReader.onload = (_fileEvent: Event) => {
      this.mmpService.importMap(fileReader.result.toString());
    };

    const fileUpload: HTMLInputElement = event.target as HTMLInputElement;
    fileReader.readAsText(fileUpload.files[0]);
  }

  private isValidLink(input: string) {
    try {
      new URL(input);
    } catch (_) {
      return false;
    }
    return true;
  }
}
