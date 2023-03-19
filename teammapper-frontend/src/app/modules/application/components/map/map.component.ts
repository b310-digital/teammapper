import { Component, ElementRef, ViewChild } from '@angular/core'
import { ExportNodeProperties, MapCreateEvent, NodeUpdateEvent } from '@mmp/map/types';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';

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

    // Initialize the mmpService component
    // This does not mean that any data is loaded just yet. Its more like initializing a mindmapp tab
    // TODO subscribe for attached map and load then?
    await this.mmpService.create('map_1', this.mapWrapper.nativeElement, settings.mapOptions)
    this.mmpService.new(this.mapSyncService.getAttachedMap().cachedMap.data)
    this.node = this.mmpService.selectNode(this.mmpService.getRootNode().id)
    this.createMapListeners()
  }

  private createMapListeners () {
    // create is NOT called by the mmp lib for initial map load / and call, but for _imported_ maps
    this.mmpService.on('create').subscribe((result: MapCreateEvent) => {
      Object.assign(this.node, this.mmpService.selectNode())

      this.mapSyncService.updateAttachedMap()
      this.mapSyncService.updateMap(result.previousMapData)
    })

    this.mmpService.on('nodeSelect').subscribe((nodeProps: ExportNodeProperties) => {
      this.mapSyncService.updateNodeSelection(nodeProps.id, true)
      Object.assign(this.node, nodeProps)
    })

    this.mmpService.on('nodeDeselect').subscribe((nodeProps: ExportNodeProperties) => {
      this.mapSyncService.updateNodeSelection(nodeProps.id, false)
      Object.assign(this.node, this.mmpService.selectNode())
    })

    this.mmpService.on('nodeUpdate').subscribe((result: NodeUpdateEvent) => {
      Object.assign(this.node, result.nodeProperties)
      this.mapSyncService.updateNode(result)
      this.mapSyncService.updateAttachedMap()
    })

    this.mmpService.on('undo').subscribe(() => {
      Object.assign(this.node, this.mmpService.selectNode())
      this.mapSyncService.updateAttachedMap()
      this.mapSyncService.updateMap()
    })

    this.mmpService.on('redo').subscribe(() => {
      Object.assign(this.node, this.mmpService.selectNode())
      this.mapSyncService.updateAttachedMap()
      this.mapSyncService.updateMap()
    })

    this.mmpService.on('nodeCreate').subscribe((newNode: ExportNodeProperties) => {
      this.mapSyncService.addNode(newNode)
      this.mapSyncService.updateAttachedMap()
      this.mmpService.selectNode(newNode.id)
      this.mmpService.editNode()
    })

    this.mmpService.on('nodeRemove').subscribe((removedNode: ExportNodeProperties) => {
      this.mapSyncService.removeNode(removedNode)
      this.mapSyncService.updateAttachedMap()
    })
  }
}
