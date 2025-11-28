import { Component, OnInit, inject } from '@angular/core';
import { UserSettings } from '../../../../shared/models/settings.model';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { Location, NgFor, NgIf, AsyncPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import {
  CachedAdminMapEntry,
  CachedMapOptions,
} from 'src/app/shared/models/cached-map.model';
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
import { MatList, MatListItem } from '@angular/material/list';
import { MatLine } from '@angular/material/core';
import { InverseBoolPipe } from '../../../../shared/pipes/inverse-bool.pipe';

@Component({
  selector: 'teammapper-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
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
    NgFor,
    MatOption,
    NgIf,
    MatSlideToggle,
    FormsModule,
    MatInput,
    MatList,
    MatListItem,
    MatLine,
    AsyncPipe,
    DatePipe,
    TranslatePipe,
    InverseBoolPipe,
  ],
})
export class SettingsComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private mmpService = inject(MmpService);
  private mapSyncService = inject(MapSyncService);
  private translateService = inject(TranslateService);
  private router = inject(Router);
  private location = inject(Location);

  public readonly languages: string[];
  public settings: UserSettings;
  public mapOptions: CachedMapOptions;
  public editMode: Observable<boolean>;
  public cachedAdminMapEntries: CachedAdminMapEntry[];

  constructor() {
    this.languages = SettingsService.LANGUAGES;
    this.settings = this.settingsService.getCachedUserSettings();
    this.mapOptions = this.mmpService.getAdditionalMapOptions();
    this.editMode = this.settingsService.getEditModeObservable();
    this.cachedAdminMapEntries = [];
  }

  public async updateGeneralMapOptions() {
    await this.settingsService.updateCachedSettings(this.settings);
  }

  public async ngOnInit() {
    this.cachedAdminMapEntries =
      await this.settingsService.getCachedAdminMapEntries();
  }

  public async updateMapOptions() {
    await this.validateMapOptionsInput();
    this.mapSyncService.updateMapOptions(this.mapOptions);
  }

  public async updateLanguage() {
    await this.settingsService.updateCachedSettings(this.settings);

    this.translateService.use(this.settings.general.language);
  }

  public back() {
    this.location.back();
  }

  public getMapUrl(entry: CachedAdminMapEntry): string {
    return this.router
      .createUrlTree([`/map/${entry.id}`], {
        fragment: entry.cachedAdminMapValue.modificationSecret,
      })
      .toString();
  }

  public getMapTitle(entry: CachedAdminMapEntry): string {
    return entry.cachedAdminMapValue.rootName || entry.id;
  }

  private async validateMapOptionsInput() {
    const defaultSettings: UserSettings = (
      await this.settingsService.getDefaultSettings()
    ).userSettings;
    if (
      this.mapOptions.fontIncrement > this.mapOptions.fontMaxSize ||
      this.mapOptions.fontIncrement < 1
    )
      this.mapOptions.fontIncrement = defaultSettings.mapOptions.fontIncrement;
    if (this.mapOptions.fontMaxSize > 99 || this.mapOptions.fontMaxSize < 15)
      this.mapOptions.fontMaxSize = defaultSettings.mapOptions.fontMaxSize;
    if (this.mapOptions.fontMinSize > 99 || this.mapOptions.fontMinSize < 15)
      this.mapOptions.fontMinSize = defaultSettings.mapOptions.fontMinSize;
  }
}
