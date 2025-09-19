import { Component, OnInit, inject } from '@angular/core';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserSettings } from '../../../../shared/models/settings.model';
import { MatSelect, MatOption } from '@angular/material/select';
import { NgFor } from '@angular/common';

@Component({
  selector: 'teammapper-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  imports: [MatSelect, NgFor, MatOption, TranslatePipe],
})
export class FooterComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private translateService = inject(TranslateService);

  public settings: UserSettings;
  public languages: string[];

  public currentYear: string;

  public ngOnInit() {
    this.settings = this.settingsService.getCachedUserSettings();
    this.languages = SettingsService.LANGUAGES;

    this.currentYear = new Date().getFullYear().toString();
  }

  public async updateLanguage() {
    await this.settingsService.updateCachedSettings(this.settings);

    this.translateService.use(this.settings.general.language);
  }
}
