import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { Settings } from '../../../../shared/models/settings.model';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'teammapper-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  imports: [MatSelect, MatOption, TranslatePipe, RouterLink],
})
export class FooterComponent implements OnInit {
  public settings: Settings;
  public languages: string[];

  public currentYear: string;

  constructor(
    private settingsService: SettingsService,
    private translateService: TranslateService
  ) {}

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
