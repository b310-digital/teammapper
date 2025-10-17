import { Component, inject } from '@angular/core';
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
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { API_URL, HttpService } from 'src/app/core/http/http.service';
import { MatIcon } from '@angular/material/icon';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { NgIf } from '@angular/common';

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
    CdkTextareaAutosize,
    FormsModule,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    TranslatePipe,
    NgIf,
  ],
})
export class DialogImportAiComponent {
  public mindmapDescription = '';
  public isGenerating = false;

  private importService = inject(ImportService);
  private settingsService = inject(SettingsService);
  private toastService = inject(ToastrService);
  private httpService = inject(HttpService);
  private utilsService = inject(UtilsService);
  private dialogRef =
    inject<MatDialogRef<DialogImportAiComponent>>(MatDialogRef);

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
          language:
            this.settingsService.getCachedUserSettings().general.language ??
            'en',
        })
      );

      if (response.status === 201) {
        this.toastService.success(
          await this.utilsService.translate(
            'TOASTS.AI_MERMAID_GENERATED_SUCCESS'
          )
        );
        const mermaidInput = await response.text();
        const success =
          await this.importService.importFromMermaid(mermaidInput);
        if (success) {
          this.dialogRef.close();
        }
      } else {
        this.toastService.error(
          await this.utilsService.translate('TOASTS.ERRORS.AI_MERMAID_ERROR')
        );
      }
    } catch (_error) {
      this.toastService.error(
        await this.utilsService.translate('TOASTS.ERRORS.AI_MERMAID_ERROR')
      );
    } finally {
      this.isGenerating = false;
    }
  }
}
