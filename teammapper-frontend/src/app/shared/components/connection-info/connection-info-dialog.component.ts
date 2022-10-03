import { Component } from '@angular/core'

@Component({
  selector: 'teammapper-connection-info-dialog',
  templateUrl: 'connection-info-dialog.component.html'
})
export class ConnectionInfoDialogComponent {
  reconnect () {
    window.location.reload()
  }
}
