import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { MapProperties } from '@mmp/map/types';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { environment } from 'src/environments/environment';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'teammapper-dialog-about',
  templateUrl: 'dialog-about.component.html',
  styleUrls: ['./dialog-about.component.scss'],
})
export class DialogAboutComponent {
  public faGithub = faGithub;
  public version: string;
  public applicationName: string;
  public map: MapProperties;
  public mapAdminId: Promise<string>;

  constructor(
    private translateService: TranslateService,
    private settingsService: SettingsService,
    private storageService: StorageService,
    private mapSyncService: MapSyncService,
    private dialogRef: MatDialogRef<DialogAboutComponent>,
    private router: Router
  ) {
    this.version = environment.version;
    this.applicationName = environment.name;
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
    return this.settingsService.getCachedSettings().general.language;
  }

  async getMapAdminId(): Promise<string> {
    return (await this.storageService.get(this.map.uuid))?.adminId;
  }
}
