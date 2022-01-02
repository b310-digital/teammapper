import {Component, Inject} from '@angular/core'
import {TranslateService} from '@ngx-translate/core'
import {MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import {faGithub} from '@fortawesome/free-brands-svg-icons'
import { MapProperties } from '@mmp/map/types';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service'
import { environment } from '../../../../environments/environment'

@Component({
  selector: 'mindmapper-about-dialog',
  templateUrl: 'about-dialog.component.html',
  styleUrls: ['./about-dialog.component.scss']
})
export class AboutDialogComponent {

  public faGithub = faGithub
  public version: string
  public applicationName: string
  public map: MapProperties
  public mapAdminId: Promise<string>

  constructor(
    public dialogRef: MatDialogRef<AboutDialogComponent>,
    private translateService: TranslateService,
    private settingsService: SettingsService,
    private storageService: StorageService,
    private mapSyncService: MapSyncService,
  ) {
    this.version = environment.version
    this.applicationName = environment.name
    this.map = this.mapSyncService.getAttachedMap().cachedMap
    this.mapAdminId = this.getMapAdminId()
  }

  async deleteMap() {
    if(confirm(this.translateService.instant('MODALS.INFO.CONFIRM_DELETE'))) {
      await this.mapSyncService.deleteMap(await this.mapAdminId)
      await this.storageService.remove(this.map.uuid)
      window.location.reload()
    } 
  }

  language(): string {
    return this.settingsService.getCachedSettings().general.language
  }

  async getMapAdminId(): Promise<string> {
    return (await this.storageService.get(this.map.uuid))?.adminId
  }
}