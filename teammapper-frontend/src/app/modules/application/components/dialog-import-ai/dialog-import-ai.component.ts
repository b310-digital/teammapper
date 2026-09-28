import { ChangeDetectorRef, Component, inject } from '@angular/core';
import {
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { ImportService } from 'src/app/core/services/import/import.service';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { API_URL, HttpService } from 'src/app/core/http/http.service';
import { MatIcon } from '@angular/material/icon';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import {
  AI_CHILDREN_PER_NODE,
  AI_LEVELS,
  AI_MAX_NODES,
  aiMapNodeCount,
  MermaidCreateResult,
} from '@teammapper/shared';

@Component({
  selector: 'teammapper-dialog-import-ai',
  templateUrl: 'dialog-import-ai.component.html',
  styleUrls: ['./dialog-import-ai.component.scss'],
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatFormField,
    MatInput,
    MatIcon,
    MatLabel,
    MatSlider,
    MatSliderThumb,
    CdkTextareaAutosize,
    FormsModule,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    TranslatePipe,
  ],
})
export class DialogImportAiComponent {
  public mindmapDescription = '';
  public isGenerating = false;
  public levels: number = AI_LEVELS.default;
  public childrenPerNode: number = AI_CHILDREN_PER_NODE.default;
  protected readonly AI_LEVELS = AI_LEVELS;
  protected readonly AI_CHILDREN_PER_NODE = AI_CHILDREN_PER_NODE;

  private importService = inject(ImportService);
  private settingsService = inject(SettingsService);
  private toastService = inject(ToastrService);
  private httpService = inject(HttpService);
  private utilsService = inject(UtilsService);
  private cdr = inject(ChangeDetectorRef);
  private dialogRef =
    inject<MatDialogRef<DialogImportAiComponent>>(MatDialogRef);
  public readonly aiModel =
    this.settingsService.getCachedSystemSettings()?.info.aiModel ?? null;

  /** Sets the levels and lowers the children per node to stay in the cap. */
  setLevels(levels: number): void {
    this.levels = levels;
    while (this.exceedsNodeCap()) this.childrenPerNode -= 1;
  }

  /** Sets the children per node and lowers the levels to stay in the cap. */
  setChildrenPerNode(childrenPerNode: number): void {
    this.childrenPerNode = childrenPerNode;
    while (this.exceedsNodeCap()) this.levels -= 1;
  }

  private exceedsNodeCap(): boolean {
    return aiMapNodeCount(this) > AI_MAX_NODES;
  }

  async generateAndImport(): Promise<void> {
    if (!this.mindmapDescription.trim()) {
      this.toastService.warning(
        await this.utilsService.translate('TOASTS.AI_DESCRIPTION_REQUIRED')
      );
      return;
    }

    this.isGenerating = true;
    this.toastService.info(
      await this.utilsService.translate('TOASTS.AI_MERMAID_GENERATING')
    );

    try {
      const response = await this.httpService.post(
        API_URL.ROOT,
        '/mermaid/create',
        JSON.stringify({
          mindmapDescription: this.mindmapDescription,
          language: this.settingsService.getLanguage(),
          levels: this.levels,
          childrenPerNode: this.childrenPerNode,
        })
      );

      if (response.status === 201) {
        await this.importResult(await response.json());
      } else {
        await this.showGenerateError();
      }
    } catch (_error) {
      await this.showGenerateError();
    } finally {
      this.isGenerating = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Imports the generated map and closes the dialog. Reports success only
   * after the import, and warns when the LLM cut the map short.
   */
  private async importResult(result: MermaidCreateResult): Promise<void> {
    if (!result.mermaid.trim()) return this.showGenerateError();
    if (!(await this.importService.importFromMermaid(result.mermaid))) return;
    this.toastService.success(
      await this.utilsService.translate('TOASTS.AI_MERMAID_GENERATED_SUCCESS')
    );
    if (result.truncated) {
      this.toastService.warning(
        await this.utilsService.translate('TOASTS.AI_MERMAID_TRUNCATED')
      );
    }
    this.dialogRef.close();
  }

  private async showGenerateError(): Promise<void> {
    this.toastService.error(
      await this.utilsService.translate('TOASTS.ERRORS.AI_MERMAID_ERROR')
    );
  }
}
