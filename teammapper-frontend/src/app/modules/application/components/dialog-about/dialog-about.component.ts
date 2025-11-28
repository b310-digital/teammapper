import { Component, inject } from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { MapProperties } from '@mmp/map/types';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { Router } from '@angular/router';
import {
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { MatButton } from '@angular/material/button';
import { NgIf, AsyncPipe, DatePipe } from '@angular/common';

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
    NgIf,
    AsyncPipe,
    DatePipe,
    TranslatePipe,
  ],
})
export class DialogAboutComponent {
  private translateService = inject(TranslateService);
  private settingsService = inject(SettingsService);
  private storageService = inject(StorageService);
  private mapSyncService = inject(MapSyncService);
  private dialogRef = inject<MatDialogRef<DialogAboutComponent>>(MatDialogRef);
  private router = inject(Router);

  public faGithub = faGithub;
  public version = '';
  public applicationName = 'TeamMapper';
  public map: MapProperties;
  public mapAdminId: Promise<string>;

  constructor() {
    const settings = this.settingsService.getCachedSystemSettings();
    this.version = settings.info?.version || this.version;
    this.applicationName = settings.info?.name || this.applicationName;
    this.map = this.mapSyncService.getAttachedMap().cachedMap;
    this.mapAdminId = this.getMapAdminId();
  }

  async deleteMap() {
    if (confirm(this.translateService.instant('MODALS.INFO.CONFIRM_DELETE'))) {
      await this.mapSyncService.deleteMap(await this.mapAdminId);
      await this.storageService.remove(this.map.uuid);

      this.dialogRef.close();

      this.router.navigate([''], {
        queryParams: {
          toastMessage: this.translateService.instant(
            'TOASTS.DELETE_MAP_SUCCESS'
          ),
        },
      });
    }
  }

  language(): string {
    return this.settingsService.getCachedUserSettings().general.language;
  }

  async getMapAdminId(): Promise<string> {
    return (await this.storageService.get(this.map.uuid))?.adminId;
  }
}
