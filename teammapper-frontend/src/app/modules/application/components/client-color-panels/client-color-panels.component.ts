import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { ClientListEntry } from 'src/app/core/services/map-sync/yjs-utils';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';
import { ClientAvatarComponent } from './client-avatar.component';

/**
 * The client list: one entry per client connected to the map. The own entry
 * is a button that opens the display name dialog.
 */
@Component({
  selector: 'teammapper-client-colors-panel',
  templateUrl: './client-color-panels.component.html',
  styleUrls: ['./client-color-panels.component.scss'],
  imports: [ClientAvatarComponent, AsyncPipe, TranslatePipe],
})
export class ClientColorPanelsComponent {
  private dialogService = inject(DialogService);

  public readonly clients: Observable<ClientListEntry[]> =
    inject(MapSyncService).getClientListObservable();

  public editDisplayName(): void {
    this.dialogService.openDisplayNameDialog();
  }
}
