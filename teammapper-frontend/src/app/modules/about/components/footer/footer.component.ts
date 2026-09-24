import { Component, OnInit, inject } from '@angular/core';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserSettings } from '@teammapper/shared';
import { MatSelect, MatOption } from '@angular/material/select';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'teammapper-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  imports: [MatSelect, MatOption, TranslatePipe, RouterLink],
})
export class FooterComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private translateService = inject(TranslateService);

  public settings: UserSettings | null = null;
  public languages: string[] = SettingsService.LANGUAGES;

  public currentYear = new Date().getFullYear().toString();

  public ngOnInit() {
    this.settings = this.settingsService.getCachedUserSettings();
  }

  public async updateLanguage() {
    if (!this.settings) return;

    await this.settingsService.updateCachedSettings(this.settings);

    this.translateService.use(this.settings.general.language);
  }
}
