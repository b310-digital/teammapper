import { Component, OnInit } from '@angular/core'
import { MapSyncService } from '../../../../core/services/map-sync/map-sync.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'
import { SettingsService } from '../../../../core/services/settings/settings.service'
import { UtilsService } from '../../../../core/services/utils/utils.service'
import { ActivatedRoute, Router, NavigationStart, RouterEvent } from '@angular/router'
import { ExportNodeProperties, MapCreateEvent, NodeProperties, NodeUpdateEvent, OptionParameters } from '@mmp/map/types'
import { StorageService } from 'src/app/core/services/storage/storage.service'
import { ServerMap } from 'src/app/core/services/map-sync/server-types'

// Initialization process of a map:
// 1) Render the wrapper element inside the map angular html component 
// 2) Wait for data fetching completion (triggered within application component) 
// 3) Init mmp library and fill map with data when available
// 4) Register to server events
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

    // Create the mind map.
    this.initMap({ ...settings.mapOptions})

    this.handleImageDropObservable()

    this.mapSyncService.getAttachedNodeObservable().subscribe((node: NodeProperties | null) => {
      this.node = node
    })

    this.settingsService.getEditModeObservable().subscribe((result: boolean) => this.editDisabled = !result)
  }

  public handleImageDropObservable () {
    UtilsService.observableDroppedImages().subscribe((image: string) => {
      this.mmpService.updateNode('imageSrc', image)
    })
  }

  // Initializes the map by either loading an existing one or creating a new one
  public async initMap (options: OptionParameters) {
    const givenId: string = this.route.snapshot.paramMap.get('id')
    const modificationSecret: string = this.route.snapshot.fragment
    const map: ServerMap = await this.loadAndPrepareWithMap(givenId, modificationSecret);

    // not found, return to start page
    if (!map) {
      this.router.navigate([''])
      return
    }
  }

  private async loadAndPrepareWithMap(mapId: string, modificationSecret: string): Promise<ServerMap> {
    if(mapId) {
      return await this.mapSyncService.prepareExistingMap(mapId, modificationSecret)
    } else {
      const privateServerMap = await this.mapSyncService.prepareNewMap()
      this.router.navigate([`/map/${privateServerMap.map.uuid}`], {fragment: privateServerMap.modificationSecret})
      return privateServerMap.map
    }
  }
}
