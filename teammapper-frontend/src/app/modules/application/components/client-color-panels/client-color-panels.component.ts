import {Component, ElementRef, OnInit, ViewChild} from '@angular/core'
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service'

@Component({
  selector: 'teammapper-client-colors-panel',
  templateUrl: './client-color-panels.component.html',
  styleUrls: ['./client-color-panels.component.scss']
})
export class ClientColorPanelsComponent {

  @ViewChild('background') public background: ElementRef

  public clientColors: string[]

  constructor (public mapSyncService: MapSyncService) {
    mapSyncService.clientListChanged.subscribe((clients: string[]) => {
      this.clientColors = clients
    })
  }

}
