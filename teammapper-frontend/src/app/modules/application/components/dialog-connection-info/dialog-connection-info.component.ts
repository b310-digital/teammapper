import { Component } from '@angular/core';

@Component({
  selector: 'teammapper-dialog-connection-info',
  templateUrl: 'dialog-connection-info.component.html',
  standalone: false,
})
export class DialogConnectionInfoComponent {
  reconnect() {
    window.location.reload();
  }
}
