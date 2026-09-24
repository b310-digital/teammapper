import { Component, inject } from '@angular/core';
import { UserSettings } from '@teammapper/shared';
import { AdditionalMapOptions } from 'src/app/core/services/mmp/mmp.service';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { Location, AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatDialogTitle } from '@angular/material/dialog';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import {
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardContent,
} from '@angular/material/card';
import { MatFormField } from '@angular/material/form-field';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { InverseBoolPipe } from '../../../../shared/pipes/inverse-bool.pipe';
import { MindmapsOverview } from 'src/app/shared/components/mindmaps-overview/mindmaps-overview.component';

@Component({
  selector: 'teammapper-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    MindmapsOverview,
    MatToolbar,
    MatDialogTitle,
    MatIconButton,
    MatIcon,
    MatTabGroup,
    MatTab,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatFormField,
    MatSelect,
    MatOption,
    MatSlideToggle,
    FormsModule,
    MatInput,
    AsyncPipe,
    TranslatePipe,
    InverseBoolPipe,
  ],
})
export class SettingsComponent {
  private settingsService = inject(SettingsService);
  private mmpService = inject(MmpService);
  private mapSyncService = inject(MapSyncService);
  private translateService = inject(TranslateService);
  private location = inject(Location);

  public readonly languages: string[];
  public settings: UserSettings | null;
  public mapOptions: AdditionalMapOptions | null;
  public editMode: Observable<boolean | null>;

  constructor() {
    this.languages = SettingsService.LANGUAGES;
    this.settings = this.settingsService.getCachedUserSettings();
    this.mapOptions = this.mmpService.getAdditionalMapOptions();
    this.editMode = this.settingsService.getEditModeObservable();
  }

  public async updateGeneralMapOptions() {
    if (!this.settings) return;

    await this.settingsService.updateCachedSettings(this.settings);
  }

  public async updateMapOptions() {
    if (!this.mapOptions) return;

    await this.validateMapOptionsInput(this.mapOptions);
    this.mapSyncService.updateMapOptions(this.mapOptions);
  }

  public async updateLanguage() {
    if (!this.settings) return;

    await this.settingsService.updateCachedSettings(this.settings);

    this.translateService.use(this.settings.general.language);
  }

  public async updateDarkMode() {
    if (!this.settings) return;

    await this.settingsService.setDarkMode(this.settings.general.darkMode);
  }

  public back() {
    this.location.back();
  }

  private async validateMapOptionsInput(mapOptions: AdditionalMapOptions) {
    const defaultSettings: UserSettings = (
      await this.settingsService.getDefaultSettings()
    ).userSettings;
    if (
      mapOptions.fontIncrement > mapOptions.fontMaxSize ||
      mapOptions.fontIncrement < 1
    )
      mapOptions.fontIncrement = defaultSettings.mapOptions.fontIncrement;
    if (mapOptions.fontMaxSize > 99 || mapOptions.fontMaxSize < 15)
      mapOptions.fontMaxSize = defaultSettings.mapOptions.fontMaxSize;
    if (mapOptions.fontMinSize > 99 || mapOptions.fontMinSize < 15)
      mapOptions.fontMinSize = defaultSettings.mapOptions.fontMinSize;
  }
}
