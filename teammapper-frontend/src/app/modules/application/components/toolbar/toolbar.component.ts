import { Component, Input, inject } from '@angular/core';
import { ExportNodeProperties } from '@teammapper/shared';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';
import {
  ExportFormat,
  MmpService,
} from 'src/app/core/services/mmp/mmp.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { AsyncPipe, NgClass } from '@angular/common';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { isRasterImageFile } from 'src/app/core/services/mmp/node-images';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { Observable, of, switchMap } from 'rxjs';
import { StopArrowModeDirective } from 'src/app/shared/directives/stop-arrow-mode.directive';

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
    AsyncPipe,
    StopArrowModeDirective,
  ],
})
export class ToolbarComponent {
  private translationService = inject(TranslateService);
  mmpService = inject(MmpService);
  private mapSyncService = inject(MapSyncService);
  private dialogService = inject(DialogService);
  private settingsService = inject(SettingsService);
  private toastrService = inject(ToastrService);
  private utilsService = inject(UtilsService);

  @Input() public node: ExportNodeProperties | null = null;
  @Input() public editDisabled = false;
  public featureFlagPictograms: boolean;
  public featureFlagAI: boolean;
  public featureFlagArrows: boolean;

  public canUndo$ = this.mapSyncService.canUndo$;
  public canRedo$ = this.mapSyncService.canRedo$;
  // Import and export need a map, read-only or not. The edit buttons get
  // the same gate through `editDisabled`.
  public mapCreated$ = this.mmpService.mapCreated$;
  /**
   * Whether arrow mode is active. The event source needs a map, so the stream
   * reports false until the map exists.
   */
  public arrowMode$: Observable<boolean> = this.mapCreated$.pipe(
    switchMap(created =>
      created ? this.mmpService.on('arrowMode') : of(false)
    )
  );

  constructor() {
    const flags = this.settingsService.getCachedSystemSettings()?.featureFlags;
    this.featureFlagPictograms = flags?.pictograms ?? false;
    this.featureFlagAI = flags?.ai ?? false;
    this.featureFlagArrows = flags?.arrows ?? false;
  }

  public async exportMap(format: ExportFormat) {
    const result = await this.mmpService.exportMap(format);
    if (result.size !== undefined && result.size > 1000 && format === 'json')
      alert(
        this.translationService.instant('MESSAGES.JSON_FILE_SIZE_TOO_LARGE')
      );
  }

  get childNodesHidden() {
    return this.mmpService.childNodesHidden();
  }

  /**
   * True when editing is off or no node is selected. The node buttons bind to
   * this getter; add tree and paste do not.
   */
  get nodeActionsDisabled(): boolean {
    return this.editDisabled || !this.mmpService.hasSelectedNode();
  }

  /**
   * True when the selected node lies in a protected branch. Angular reads the
   * getter on every change detection, so the button follows a peer's protect
   * or release. The walk up the parents costs one step per ancestor.
   */
  get branchProtected(): boolean {
    return this.mmpService.protectingNode() !== null;
  }

  // In some cases the mmpService is not yet initialized so trying to call getSelectedNode() will throw an error
  get canHideNodes() {
    if (this.mmpService) {
      const selectedNode = this.mmpService.getSelectedNode();
      return selectedNode && !selectedNode.isRoot;
    }
  }

  /** Start arrow mode from the selected node, or end it when it runs. */
  public toggleArrowMode(): void {
    if (this.mmpService.isArrowMode()) this.mmpService.stopArrowMode();
    else this.mmpService.startArrowMode();
  }

  public handleUndo(): void {
    this.mapSyncService.undo();
  }

  public handleRedo(): void {
    this.mapSyncService.redo();
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
    const selected = this.mmpService.selectNode();
    if (!selected) return;

    if (selected.font?.style === 'italic') {
      this.mmpService.updateNode('fontStyle', 'normal');
    } else {
      this.mmpService.updateNode('fontStyle', 'italic');
    }
  }

  public addLink() {
    const linkInput = prompt(
      this.translationService.instant('MODALS.LINK.URL')
    );
    if (linkInput !== null && this.isValidLink(linkInput))
      this.mmpService.addNodeLink(linkInput);
  }

  public removeLink() {
    this.mmpService.removeNodeLink();
  }

  public toogleNodeFontWeight() {
    const selected = this.mmpService.selectNode();
    if (!selected) return;

    if (selected.font?.weight === 'bold') {
      this.mmpService.updateNode('fontWeight', 'normal');
    } else {
      this.mmpService.updateNode('fontWeight', 'bold');
    }
  }

  public async openAbout() {
    this.dialogService.openAboutDialog();
  }

  public openSettings() {
    this.dialogService.openSettingsDialog();
  }

  public async initImageUpload(event: Event) {
    const fileUpload: HTMLInputElement = event.target as HTMLInputElement;
    const file = fileUpload.files?.[0];
    if (!file || !isRasterImageFile(file)) return;

    await this.mmpService.addNodeImage(file, true);
  }

  public initJSONUpload(event: Event) {
    const fileReader = new FileReader();

    fileReader.onload = (_fileEvent: Event) => {
      void this.importJSON(fileReader.result?.toString() ?? '');
    };

    const fileUpload: HTMLInputElement = event.target as HTMLInputElement;
    const file = fileUpload.files?.[0];
    if (file) fileReader.readAsText(file);
  }

  /** Import the map from the JSON text; the user sees an error on failure. */
  private async importJSON(json: string): Promise<void> {
    try {
      await this.mmpService.importMap(json);
    } catch {
      const message = await this.utilsService.translate(
        'TOASTS.ERRORS.IMPORT_ERROR'
      );
      this.toastrService.error(message);
    }
  }

  private isValidLink(input: string): boolean {
    try {
      const url = new URL(input);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }
}
