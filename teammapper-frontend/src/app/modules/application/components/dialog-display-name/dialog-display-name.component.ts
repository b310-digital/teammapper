import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { SettingsService } from 'src/app/core/services/settings/settings.service';

/**
 * Edits the display name from the own client icon. Save stores the name, and
 * Cancel and Escape close the dialog without a change. A display name is no
 * map edit, so the dialog also works on a map the client may only read.
 */
@Component({
  selector: 'teammapper-dialog-display-name',
  templateUrl: './dialog-display-name.component.html',
  styleUrls: ['./dialog-display-name.component.scss'],
  imports: [
    FormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormField,
    MatLabel,
    MatHint,
    MatInput,
    MatButton,
    TranslatePipe,
  ],
})
export class DialogDisplayNameComponent {
  private settingsService = inject(SettingsService);
  private dialogRef =
    inject<MatDialogRef<DialogDisplayNameComponent>>(MatDialogRef);

  public displayName =
    this.settingsService.getCachedUserSettings()?.general.displayName ?? '';

  /** Store the name, normalized by SettingsService, and close. */
  public async save(): Promise<void> {
    await this.settingsService.setDisplayName(this.displayName);
    this.dialogRef.close();
  }

  public cancel(): void {
    this.dialogRef.close();
  }
}
