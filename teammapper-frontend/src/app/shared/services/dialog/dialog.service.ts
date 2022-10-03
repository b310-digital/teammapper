import { Injectable } from '@angular/core'
import { MatDialog, MatDialogRef, MatDialogConfig } from '@angular/material/dialog'
import { ConnectionInfoDialogComponent } from 'src/app/shared/components/connection-info/connection-info-dialog.component'
import { AboutDialogComponent } from '../../components/about-modal/about-dialog.component'
import { ShareDialogComponent } from '../../components/share-dialog/share-dialog.component'

@Injectable({
  providedIn: 'root'
  })
export class DialogService {
  private disconnectModalRef: MatDialogRef<ConnectionInfoDialogComponent>
  private shareModalRef: MatDialogRef<ShareDialogComponent>
  private aboutModalRef: MatDialogRef<AboutDialogComponent>

  constructor (
    public dialog: MatDialog) {
  }

  openDisconnectDialog () {
    this.disconnectModalRef = this.dialog.open(ConnectionInfoDialogComponent)
  }

  openShareDialog () {
    this.shareModalRef = this.dialog.open(ShareDialogComponent)
  }

  closeDisconnectDialog () {
    if (!this.disconnectModalRef) return

    this.disconnectModalRef.close()
  }

  openAboutDialog () {
    this.aboutModalRef = this.dialog.open(AboutDialogComponent, { maxHeight: '90vh' })
  }

  closeAboutDialog () {
    if (!this.aboutModalRef) return

    this.aboutModalRef.close()
  }

  closeShareDialog () {
    if (!this.shareModalRef) return

    this.shareModalRef.close()
  }
}
