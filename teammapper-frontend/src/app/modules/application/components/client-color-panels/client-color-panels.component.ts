import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { ClientListEntry } from 'src/app/core/services/map-sync/yjs-utils';
import { ClientAvatarComponent } from './client-avatar.component';

/** The client list: one entry per client connected to the map. */
@Component({
  selector: 'teammapper-client-colors-panel',
  templateUrl: './client-color-panels.component.html',
  styleUrls: ['./client-color-panels.component.scss'],
  imports: [ClientAvatarComponent, AsyncPipe, TranslatePipe],
})
export class ClientColorPanelsComponent {
  public readonly clients: Observable<ClientListEntry[]> =
    inject(MapSyncService).getClientListObservable();
}
