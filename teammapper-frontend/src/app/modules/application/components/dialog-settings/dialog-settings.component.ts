import {
  ChangeDetectorRef,
  Component,
  Signal,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  BRANCH_STYLES,
  BranchStyle,
  branchStyleOf,
  CachedMapOptions,
  UserSettings,
} from '@teammapper/shared';
import { AdditionalMapOptions } from 'src/app/core/services/mmp/mmp.service';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import {
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import {
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardContent,
} from '@angular/material/card';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { InverseBoolPipe } from '../../../../shared/pipes/inverse-bool.pipe';
import { MindmapsOverview } from 'src/app/shared/components/mindmaps-overview/mindmaps-overview.component';
import { MapDeletionComponent } from '../map-deletion/map-deletion.component';

@Component({
  selector: 'teammapper-dialog-settings',
  templateUrl: './dialog-settings.component.html',
  styleUrls: ['./dialog-settings.component.scss'],
  imports: [
    MindmapsOverview,
    MapDeletionComponent,
    MatDialogTitle,
    MatDialogContent,
    MatDialogClose,
    MatIconButton,
    MatIcon,
    MatTabGroup,
    MatTab,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatFormField,
    MatLabel,
    MatHint,
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
export class DialogSettingsComponent {
  private settingsService = inject(SettingsService);
  private mmpService = inject(MmpService);
  private mapSyncService = inject(MapSyncService);
  private translateService = inject(TranslateService);
  private changeDetector = inject(ChangeDetectorRef);

  public readonly languages: string[];
  public readonly branchStyles: readonly BranchStyle[] = BRANCH_STYLES;
  public settings: UserSettings | null = null;
  /** The display name field's draft, stored when the field commits. */
  public displayName = '';
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
    this.editMode = this.settingsService.getEditModeObservable();
    this.settingsService.userSettings
      .pipe(takeUntilDestroyed())
      .subscribe(settings => this.showSettings(settings));
  }

  /**
   * Show the latest settings, which another tab may have saved while the
   * dialog is open, so the form never edits an outdated copy.
   */
  private showSettings(settings: UserSettings | null) {
    this.settings = withBranchStyle(settings);
    this.displayName = settings?.general.displayName ?? '';
    this.changeDetector.markForCheck();
  }

  /**
   * Store the edited user settings and apply them to the map behind the
   * dialog.
   */
  public async updateGeneralMapOptions() {
    if (!this.settings) return;

    const mapOptions = this.settings.mapOptions;
    await this.settingsService.setUserMapOptions(mapOptions);
    this.mmpService.updateUserMapOptions(mapOptions);
  }

  /**
   * Apply the edited map settings. The call runs synchronously, so the new
   * values reach MmpService before the user types into the next field.
   */
  public updateMapOptions(key: keyof AdditionalMapOptions, event: Event) {
    const applied = this.appliedMapOptions();
    const input = event.target;
    if (!applied || !(input instanceof HTMLInputElement)) return;

    // Read the changed field directly and merge it with the latest applied
    // settings. The form may still hold values from before a local edit or a
    // peer's update, until Angular refreshes its bindings.
    const options = { ...applied, [key]: input.valueAsNumber };

    this.mapSyncService.updateMapOptions(validMapOptions(options, applied));
  }

  public async updateLanguage() {
    if (!this.settings) return;

    const language = this.settings.general.language;
    await this.settingsService.setLanguage(language);
    this.translateService.use(language);
  }

  /**
   * Store the edited display name and show it as SettingsService normalized
   * it. Until then the field edits a draft, so a dialog closed mid-edit stores
   * nothing.
   */
  public async updateDisplayName() {
    if (!this.settings) return;

    await this.settingsService.setDisplayName(this.displayName);
    this.displayName = this.settings.general.displayName;
  }

  public async updateDarkMode() {
    if (!this.settings) return;

    await this.settingsService.setDarkMode(this.settings.general.darkMode);
  }
}

/**
 * The settings with a known branch style. Settings cached before branch styles
 * lack one, and the select shows `tapered` for them, as mmp draws it. The
 * first change in the dialog stores the value.
 */
function withBranchStyle(settings: UserSettings | null): UserSettings | null {
  if (!settings) return null;

  const branchStyle = branchStyleOf(settings.mapOptions.branchStyle);
  return { ...settings, mapOptions: { ...settings.mapOptions, branchStyle } };
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
