import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { ImportService } from 'src/app/core/services/import/import.service';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { API_URL, HttpService } from 'src/app/core/http/http.service';
import { MatIcon } from '@angular/material/icon';
import { NgIf } from '@angular/common';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from 'src/app/core/services/utils/utils.service';

@Component({
  selector: 'teammapper-dialog-import-mermaid',
  templateUrl: 'dialog-import-mermaid.component.html',
  styleUrls: ['./dialog-import-mermaid.component.scss'],
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatFormField,
    MatInput,
    MatIcon,
    MatLabel,
    MatSuffix,
    CdkTextareaAutosize,
    FormsModule,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    TranslatePipe,
    NgIf,
  ],
})
export class DialogImportMermaidComponent {
  private importService = inject(ImportService);
  private toastService = inject(ToastrService);
  private httpService = inject(HttpService);
  private utilsService = inject(UtilsService);
  private settingsService = inject(SettingsService);

  private dialogRef =
    inject<MatDialogRef<DialogImportMermaidComponent>>(MatDialogRef);
  private router = inject(Router);

  public mermaidInput = '';
  public mindmapDescription = '';
  public featureFlagAI: boolean =
    this.settingsService.getCachedSystemSettings().featureFlags.ai;

  async createMermaidMindmapFromServer(): Promise<void> {
    this.toastService.info(
      await this.utilsService.translate('TOASTS.AI_MERMAID_GENERATING')
    );
    const response = await this.httpService.post(
      API_URL.ROOT,
      '/mermaid/create',
      JSON.stringify({
        mindmapDescription: this.mindmapDescription,
        language:
          this.settingsService.getCachedUserSettings().general.language ?? 'en',
      })
    );
    if (response.status === 201) {
      this.toastService.success(
        await this.utilsService.translate('TOASTS.AI_MERMAID_GENERATED_SUCCESS')
      );
      this.mermaidInput = await response.text();
    } else {
      this.toastService.error(
        await this.utilsService.translate('TOASTS.ERRORS.AI_MERMAID_ERROR')
      );
    }
  }

  async import() {
    const success = await this.importService.importFromMermaid(
      this.mermaidInput
    );
    if (success) {
      this.dialogRef.close();
    }
  }
}
