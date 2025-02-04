import { Component, ElementRef, ViewChild } from '@angular/core';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'teammapper-client-colors-panel',
  templateUrl: './client-color-panels.component.html',
  styleUrls: ['./client-color-panels.component.scss'],
  standalone: false,
})
export class ClientColorPanelsComponent {
  @ViewChild('background') public background: ElementRef;

  public clientColors: Observable<string[]>;

  constructor(public mapSyncService: MapSyncService) {
    this.clientColors = mapSyncService.getClientListObservable();
  }
}
