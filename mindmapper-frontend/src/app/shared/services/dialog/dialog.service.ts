import { Injectable } from '@angular/core'
import { MatDialog, MatDialogRef } from '@angular/material/dialog'
import { ConnectionInfoDialogComponent } from 'src/app/shared/components/connection-info/connection-info-dialog.component'
import { ShareFallbackComponent } from '../../components/share-fallback/share-fallback.component'


@Injectable({
    providedIn: 'root'
})
export class DialogService {

  private disconnectModalRef: MatDialogRef<ConnectionInfoDialogComponent>
  private shareModalRef: MatDialogRef<ShareFallbackComponent>

  constructor (public dialog: MatDialog) {
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

  closeShareDialog() {
    if(!this.shareModalRef) return

    this.shareModalRef.close()
  }
}