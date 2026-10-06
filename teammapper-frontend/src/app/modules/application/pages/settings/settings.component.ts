import { Component, Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CachedMapOptions, UserSettings } from '@teammapper/shared';
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
import { MapDeletionComponent } from '../../components/map-deletion/map-deletion.component';

@Component({
  selector: 'teammapper-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    MindmapsOverview,
    MapDeletionComponent,
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
  private readonly appliedMapOptions = toSignal(
    this.mmpService.additionalMapOptions$,
    { initialValue: null }
  );
  /**
   * The copy of the map settings the form edits. A peer's change replaces it.
   */
  public readonly mapOptions: Signal<AdditionalMapOptions | null> = computed(
    () => {
      const options = this.appliedMapOptions();
      return options && { ...options };
    }
  );
  public editMode: Observable<boolean | null>;

  constructor() {
    this.languages = SettingsService.LANGUAGES;
    this.settings = this.settingsService.getCachedUserSettings();
    this.editMode = this.settingsService.getEditModeObservable();
  }

  public async updateGeneralMapOptions() {
    if (!this.settings) return;

    await this.settingsService.updateCachedSettings(this.settings);
  }

  /**
   * Apply the edited map settings. The call runs synchronously, so the new
   * values reach MmpService before the user types into the next field.
   */
  public updateMapOptions() {
    const options = this.mapOptions();
    const applied = this.appliedMapOptions();
    if (!options || !applied) return;

    this.mapSyncService.updateMapOptions(validMapOptions(options, applied));
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
}

/**
 * Validate edited values and preserve the other stored map settings, including
 * values from older maps outside the form's range. MmpService puts the
 * configured default in place of each invalid edit.
 */
function validMapOptions(
  options: AdditionalMapOptions,
  applied: AdditionalMapOptions
): CachedMapOptions {
  const validOrUnchanged = (
    value: number,
    stored: number,
    min: number,
    max: number
  ) => (value === stored || (value >= min && value <= max) ? value : undefined);
  const { fontIncrement, fontMaxSize } = options;
  return {
    fontMinSize: validOrUnchanged(
      options.fontMinSize,
      applied.fontMinSize,
      15,
      99
    ),
    fontMaxSize: validOrUnchanged(fontMaxSize, applied.fontMaxSize, 15, 99),
    fontIncrement: validOrUnchanged(
      fontIncrement,
      applied.fontIncrement,
      1,
      fontMaxSize
    ),
  };
}
