import { Component, ElementRef, ViewChild, OnDestroy } from '@angular/core'
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service'
import { Subscription } from 'rxjs';

@Component({
  selector: 'teammapper-client-colors-panel',
  templateUrl: './client-color-panels.component.html',
  styleUrls: ['./client-color-panels.component.scss']
})
export class ClientColorPanelsComponent implements OnDestroy {
  @ViewChild('background') public background: ElementRef

  public clientColors: string[]
  private mapSyncServiceSubscription: Subscription;

  constructor (public mapSyncService: MapSyncService) {
    this.mapSyncServiceSubscription = mapSyncService.getClientListObservable().subscribe((clients: string[]) => {
      this.clientColors = clients
    })
  }

  ngOnDestroy() {
    this.mapSyncServiceSubscription.unsubscribe()
  }
}
