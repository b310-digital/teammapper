import { Component, OnInit } from '@angular/core'
import { MapSyncService } from '../../../../core/services/map-sync/map-sync.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'
import { SettingsService } from '../../../../core/services/settings/settings.service'
import { UtilsService } from '../../../../core/services/utils/utils.service'
import { NotificationService } from '../../../../core/services/notification/notification.service'
import { ActivatedRoute, Router } from '@angular/router'
import { ExportNodeProperties, MapCreateEvent, NodeUpdateEvent } from '@mmp/map/types'
import { MapOptions } from 'src/app/shared/models/settings.model'

@Component({
    selector: 'mindmapp-application',
    templateUrl: './application.component.html',
    styleUrls: ['./application.component.scss']
})
export class ApplicationComponent implements OnInit {

    public node: any

    constructor (private mmpService: MmpService,
                 private settingsService: SettingsService,
                 private notificationService: NotificationService,
                 private mapSyncService: MapSyncService,
                 private route: ActivatedRoute,
                 private router: Router) {
        this.node = {}
    }

    public async ngOnInit () {
        const settings = this.settingsService.getCachedSettings()

        // Create the mind map.
        this.initMap(settings.mapOptions)

        this.notificationService.setMessage('MESSAGES.INITIAL_INFORMATION')

        this.handleImageDropObservable()
    }

    public handleImageDropObservable () {
        UtilsService.observableDroppedImages().subscribe((image: string) => {
            this.mmpService.updateNode('imageSrc', image)
        })
    }

    public async initMap (options: MapOptions) {
        // Initialize a map
        // This does not mean that any data is loaded just yet. Its more like initializing a mindmapp tab
        // Map_1 is currently apparently hardcoded inside the map component...
        this.mmpService.create('map_1', options)


        // Try to either load the given id from the server, or initialize a new map with empty data
        const givenId: string = this.route.snapshot.paramMap.get('id')

        const result: boolean = await this.mapSyncService.init(givenId)

        // not found, return to start page
        if(!result) {
            this.router.navigate([''])
            return
        }

        const attachedMap = this.mapSyncService.getAttachedMap()

        if(!givenId) {
          history.replaceState({}, '', `/mmp/${attachedMap.cachedMap.uuid}`)
        }

        this.node = this.mmpService.selectNode(this.mmpService.getRootNode().id)

        // Initialize all listeners
        this.createMapListeners()
    }

    public createMapListeners () {
        // create is NOT called for initial map load / and call, but for imported maps
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
        })

        this.mmpService.on('nodeRemove').subscribe((removedNode: ExportNodeProperties) => {
            this.mapSyncService.removeNode(removedNode)
            this.mapSyncService.updateAttachedMap()
        })
    }
}

