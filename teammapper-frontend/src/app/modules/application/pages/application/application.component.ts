import { Component, OnInit } from '@angular/core'
import { MapSyncService } from '../../../../core/services/map-sync/map-sync.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'
import { SettingsService } from '../../../../core/services/settings/settings.service'
import { UtilsService } from '../../../../core/services/utils/utils.service'
import { ActivatedRoute, Router, NavigationStart, RouterEvent } from '@angular/router'
import { ExportNodeProperties, MapCreateEvent, NodeUpdateEvent, OptionParameters } from '@mmp/map/types'
import { StorageService } from 'src/app/core/services/storage/storage.service'
import { ServerMap } from 'src/app/core/services/map-sync/server-types'

@Component({
  selector: 'teammapper-application',
  templateUrl: './application.component.html',
  styleUrls: ['./application.component.scss']
})
export class ApplicationComponent implements OnInit {
  public node: any
  public editDisabled: boolean

  constructor (private mmpService: MmpService,
    private settingsService: SettingsService,
    private mapSyncService: MapSyncService,
    private storageService: StorageService,
    private route: ActivatedRoute,
    private router: Router) {
    this.node = {}
  }

  public async ngOnInit () {
    const settings = this.settingsService.getCachedSettings()
    this.storageService.cleanExpired()

    // If the map was already initialized before, reload the page as otherwise mmp library gets into a broken state 
    if(this.mmpService.getCurrentMap()) window.location.reload()

    // Create the mind map.
    this.initMap({ ...settings.mapOptions})

    this.handleImageDropObservable()

    this.router.events.subscribe((event: RouterEvent) => {
      if (event instanceof NavigationStart) {
        this.mapSyncService.leaveMap()
      }
    })

    this.settingsService.getEditModeSubject().subscribe((result: boolean) => this.editDisabled = !result)
  }

  public handleImageDropObservable () {
    UtilsService.observableDroppedImages().subscribe((image: string) => {
      this.mmpService.updateNode('imageSrc', image)
    })
  }

  // Initializes the map by either loading an existing one or creating a new one
  // Right now creation would be triggered with the /map route and forward to /map/ABC.
  public async initMap (options: OptionParameters) {
    // Initialize the mmpService component
    // This does not mean that any data is loaded just yet. Its more like initializing a mindmapp tab
    await this.mmpService.create('map_1', options)

    // Try to either load the given id from the server, or initialize a new map with empty data
    const givenId: string = this.route.snapshot.paramMap.get('id')
    const modificationSecret: string = this.route.snapshot.fragment
    const map: ServerMap = await this.loadAndPrepareWithMap(givenId, modificationSecret);

    // not found, return to start page
    if (!map) {
      this.router.navigate([''])
      return
    }

    this.node = this.mmpService.selectNode(this.mmpService.getRootNode().id)

    // Initialize all listeners
    this.createMapListeners()
  }

  public createMapListeners () {
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

  private async loadAndPrepareWithMap(mapId: string, modificationSecret: string): Promise<ServerMap> {
    if(mapId) {
      return await this.mapSyncService.initExistingMap(mapId, modificationSecret)
    } else {
      const privateServerMap = await this.mapSyncService.initNewMap()
      this.router.navigate([`/map/${privateServerMap.map.uuid}`], {fragment: privateServerMap.modificationSecret})
      return privateServerMap.map
    }
  }
}
