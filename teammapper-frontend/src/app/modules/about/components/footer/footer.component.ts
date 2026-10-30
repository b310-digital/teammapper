import { Component, OnInit, inject } from '@angular/core';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserSettings } from '@teammapper/shared';
import { MatSelect, MatOption } from '@angular/material/select';

@Component({
  selector: 'teammapper-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  imports: [MatSelect, MatOption, TranslatePipe],
})
export class FooterComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private translateService = inject(TranslateService);

  public settings: UserSettings | null = null;
  public languages: string[] = SettingsService.LANGUAGES;

  public currentYear = new Date().getFullYear().toString();
  /** The template shows the imprint and privacy links only when set. */
  public imprintUrl: string | null = null;
  public privacyUrl: string | null = null;

  public ngOnInit() {
    this.settings = this.settingsService.getCachedUserSettings();
    const urls = this.settingsService.getCachedSystemSettings()?.urls;
    this.imprintUrl = urls?.imprintUrl || null;
    this.privacyUrl = urls?.privacyUrl || null;
  }

  public async updateLanguage() {
    if (!this.settings) return;

    await this.settingsService.updateCachedSettings(this.settings);

    this.translateService.use(this.settings.general.language);
  }
}
