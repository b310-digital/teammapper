import { Injectable } from '@angular/core'
import { MatDialog, MatDialogRef, MatDialogConfig } from '@angular/material/dialog'
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service'
import { ConnectionInfoDialogComponent } from 'src/app/shared/components/connection-info/connection-info-dialog.component'
import { AboutDialogComponent } from '../../components/about-modal/about-dialog.component'
import { ShareFallbackComponent } from '../../components/share-fallback/share-fallback.component'


@Injectable({
    providedIn: 'root'
})
export class DialogService {

  private disconnectModalRef: MatDialogRef<ConnectionInfoDialogComponent>
  private shareModalRef: MatDialogRef<ShareFallbackComponent>
  private aboutModalRef: MatDialogRef<AboutDialogComponent>

  constructor (public dialog: MatDialog, private mapSyncService: MapSyncService) {
  }

  openDisconnectDialog() {
    this.disconnectModalRef = this.dialog.open(ConnectionInfoDialogComponent)
  }

  openShareDialog() {
    this.shareModalRef = this.dialog.open(ShareFallbackComponent)
  }

  closeDisconnectDialog() {
    if(!this.disconnectModalRef) return

    this.disconnectModalRef.close()
  }

  openAboutDialog() {
    const dialogConfig: MatDialogConfig = new MatDialogConfig()
    dialogConfig.data = {
      deletedAt: this.mapSyncService.getAttachedMap().cachedMap.deletedAt || '',
      deleteAfterDays: this.mapSyncService.getAttachedMap().cachedMap.deleteAfterDays || '-'
    }
    this.aboutModalRef = this.dialog.open(AboutDialogComponent, dialogConfig)
  }

  closeAboutDialog() {
    if(!this.aboutModalRef) return

    this.aboutModalRef.close()
  }

  closeShareDialog() {
    if(!this.shareModalRef) return

    this.shareModalRef.close()
  }
}