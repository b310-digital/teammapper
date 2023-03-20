import { Component, ElementRef, ViewChild } from '@angular/core'
import { ExportNodeProperties, MapCreateEvent, NodeUpdateEvent } from '@mmp/map/types';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { CachedMapEntry } from 'src/app/shared/models/cached-map.model';

@Component({
  selector: 'teammapper-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent {
  @ViewChild('map') mapWrapper: ElementRef<HTMLElement>;
  public node: any

  constructor (
    private settingsService: SettingsService,
    private mmpService: MmpService,
    private mapSyncService: MapSyncService
  ) {
    this.node = {}
  }

  public async ngAfterViewInit() {
    this.mmpService.remove()
    const settings = this.settingsService.getCachedSettings()

    this.mapSyncService.getattachedMapSubject().subscribe(async (result: CachedMapEntry | null) => {
      if(result === null) return

      // Initialize the mmpService component
      // This does not mean that any data is loaded just yet. Its more like initializing a mindmapp tab
      // TODO subscribe for attached map and load then?
      await this.mmpService.create('map_1', this.mapWrapper.nativeElement, settings.mapOptions)
        console.log('update')
        console.log(result)
        this.mmpService.new(result.cachedMap.data)
        this.node = this.mmpService.selectNode(this.mmpService.getRootNode().id)
        this.createMapListeners()
      })
  }
}
