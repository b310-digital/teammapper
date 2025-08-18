import { Component, ElementRef, ViewChild } from '@angular/core';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { Observable } from 'rxjs';
import { NgFor, NgStyle, AsyncPipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'teammapper-client-colors-panel',
  templateUrl: './client-color-panels.component.html',
  styleUrls: ['./client-color-panels.component.scss'],
  imports: [NgFor, MatIcon, NgStyle, AsyncPipe],
})
export class ClientColorPanelsComponent {
  @ViewChild('background') public background: ElementRef;

  public clientColors: Observable<string[]>;

  constructor(public mapSyncService: MapSyncService) {
    this.clientColors = mapSyncService.getClientListObservable();
  }
}
