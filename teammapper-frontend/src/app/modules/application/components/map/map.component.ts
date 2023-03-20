import { Component, ElementRef, ViewChild } from '@angular/core'
import { ExportNodeProperties, MapCreateEvent, NodeUpdateEvent } from '@mmp/map/types';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { CachedMapEntry } from 'src/app/shared/models/cached-map.model';

import { first } from 'rxjs/operators';

@Component({
  selector: 'teammapper-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent {
  @ViewChild('map') mapWrapper: ElementRef<HTMLElement>;

  constructor (
    private settingsService: SettingsService,
    private mmpService: MmpService,
    private mapSyncService: MapSyncService
  ) {}

  // Init process of a map:
  // 1) Render the wrapper element inside the map angular html component 
  // 2) Init mmp library with generating svg wrapper
  // 3) Fill map with data
  // 4) Register to server events
  public async ngAfterViewInit() {
    const settings = this.settingsService.getCachedSettings()

    this.mapSyncService.getAttachedMapObservable().pipe(first(val => val !== null)).subscribe(async (result: CachedMapEntry | null) => {
      await this.mmpService.create('map_1', this.mapWrapper.nativeElement, settings.mapOptions)
      this.mapSyncService.initMap()
    })
  }
}
