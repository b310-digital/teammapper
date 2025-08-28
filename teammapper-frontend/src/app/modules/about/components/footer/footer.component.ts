import { Component, OnInit, inject } from '@angular/core';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { TranslateService } from '@ngx-translate/core';
import { Settings } from '../../../../shared/models/settings.model';

@Component({
  selector: 'teammapper-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  standalone: false,
})
export class FooterComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private translateService = inject(TranslateService);

  public settings: Settings;
  public languages: string[];

  public currentYear: string;

  public ngOnInit() {
    this.settings = this.settingsService.getCachedSettings();
    this.languages = SettingsService.LANGUAGES;

    this.currentYear = new Date().getFullYear().toString();
  }

  public async updateLanguage() {
    await this.settingsService.updateCachedSettings(this.settings);

    this.translateService.use(this.settings.general.language);
  }
}
