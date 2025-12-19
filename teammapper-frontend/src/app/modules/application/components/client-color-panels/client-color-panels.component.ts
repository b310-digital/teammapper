import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { Observable } from 'rxjs';
import { NgStyle, AsyncPipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'teammapper-client-colors-panel',
  templateUrl: './client-color-panels.component.html',
  styleUrls: ['./client-color-panels.component.scss'],
  imports: [MatIcon, NgStyle, AsyncPipe],
})
export class ClientColorPanelsComponent {
  mapSyncService = inject(MapSyncService);

  @ViewChild('background') public background: ElementRef;

  public clientColors: Observable<string[]>;

  constructor() {
    const mapSyncService = this.mapSyncService;

    this.clientColors = mapSyncService.getClientListObservable();
  }
}
