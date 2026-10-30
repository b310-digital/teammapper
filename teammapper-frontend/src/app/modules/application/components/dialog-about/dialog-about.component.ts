import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import {
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { MatButton } from '@angular/material/button';
import { ShortcutListComponent } from '../shortcut-list/shortcut-list.component';

@Component({
  selector: 'teammapper-dialog-about',
  templateUrl: 'dialog-about.component.html',
  styleUrls: ['./dialog-about.component.scss'],
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    FaIconComponent,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    ShortcutListComponent,
    TranslatePipe,
  ],
})
export class DialogAboutComponent {
  private settingsService = inject(SettingsService);

  public faGithub = faGithub;
  public version = '';
  public applicationName = 'TeamMapper';
  /** The template shows the imprint and privacy links only when set. */
  public imprintUrl: string | null = null;
  public privacyUrl: string | null = null;

  constructor() {
    const settings = this.settingsService.getCachedSystemSettings();
    this.version = settings?.info?.version || this.version;
    this.applicationName = settings?.info?.name || this.applicationName;
    this.imprintUrl = settings?.urls?.imprintUrl || null;
    this.privacyUrl = settings?.urls?.privacyUrl || null;
  }

  language(): string {
    return this.settingsService.getLanguage();
  }
}
