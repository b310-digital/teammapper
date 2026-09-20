import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Subscription, Observable } from 'rxjs';
import { ConnectionStatus } from '../../../../core/services/map-sync/map-sync-context';
import { MapSyncService } from '../../../../core/services/map-sync/map-sync.service';
import { MmpService } from '../../../../core/services/mmp/mmp.service';
import { SettingsService } from '../../../../core/services/settings/settings.service';
import { UtilsService } from '../../../../core/services/utils/utils.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ExportNodeProperties } from '@teammapper/shared';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { ServerMap } from 'src/app/core/services/map-sync/server-types';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';
import { ColorPanelsComponent } from '../../components/color-panels/color-panels.component';
import { ClientColorPanelsComponent } from '../../components/client-color-panels/client-color-panels.component';
import { SliderPanelsComponent } from '../../components/slider-panels/slider-panels.component';
import { FloatingButtonsComponent } from '../../components/floating-buttons/floating-buttons.component';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { MapComponent } from '../../components/map/map.component';
import { AsyncPipe } from '@angular/common';
import { InverseBoolPipe } from '../../../../shared/pipes/inverse-bool.pipe';

// Initialization process of a map:
// 1) Render the wrapper element inside the map angular html component
// 2) Wait for data fetching completion (triggered within application component)
// 3) Init mmp library and fill map with data when available
// 4) Register to server events
@Component({
  selector: 'teammapper-application',
  templateUrl: './application.component.html',
  styleUrls: ['./application.component.scss'],
  imports: [
    ColorPanelsComponent,
    ClientColorPanelsComponent,
    SliderPanelsComponent,
    FloatingButtonsComponent,
    ToolbarComponent,
    MapComponent,
    AsyncPipe,
    InverseBoolPipe,
  ],
})
export class ApplicationComponent implements OnInit, OnDestroy {
  private mmpService = inject(MmpService);
  private settingsService = inject(SettingsService);
  private mapSyncService = inject(MapSyncService);
  private storageService = inject(StorageService);
  private dialogService = inject(DialogService);
  private utilsService = inject(UtilsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  public node: Observable<ExportNodeProperties | null>;
  public editMode: Observable<boolean | null>;

  private imageDropSubscription: Subscription;
  private connectionStatusSubscription: Subscription;

  async ngOnInit() {
    this.storageService.cleanExpired();

    this.initMap();

    this.handleImageDropObservable();

    this.node = this.mapSyncService.getAttachedNodeObservable();
    this.connectionStatusSubscription = this.mapSyncService
      .getConnectionStatusObservable()
      .subscribe((status: ConnectionStatus) => {
        // A null status means no connection is open any more, so the dialog
        // has nothing left to report and closes with the connected case.
        if (status === 'disconnected')
          this.dialogService.openDisconnectDialog();
        else this.dialogService.closeDisconnectDialog();
      });
    this.editMode = this.settingsService.getEditModeObservable();
  }

  ngOnDestroy() {
    this.imageDropSubscription.unsubscribe();
    this.connectionStatusSubscription.unsubscribe();
    // The dialog is an overlay, so it outlives this component unless we close
    // it here: teardown order can drop the status that would have closed it.
    this.dialogService.closeDisconnectDialog();
  }

  public handleImageDropObservable() {
    this.imageDropSubscription =
      UtilsService.observableDroppedImages().subscribe((image: string) => {
        this.mmpService.updateNode('imageSrc', image);
      });
  }

  // Initializes the map by either loading an existing one or creating a new one
  private async initMap() {
    const givenId = this.route.snapshot.paramMap.get('id');
    const modificationSecret = this.route.snapshot.fragment;
    const map = await this.loadAndPrepareWithMap(givenId, modificationSecret);

    // not found, return to start page
    if (!map) {
      this.router.navigate(['']);
      return;
    }
  }

  private async loadAndPrepareWithMap(
    mapId: string | null,
    modificationSecret: string | null
  ): Promise<ServerMap | null> {
    if (!mapId) {
      console.error(
        'No map ID provided - this should not happen with the guard in place'
      );
      return null;
    }

    const existingMap = await this.mapSyncService.prepareExistingMap(
      mapId,
      modificationSecret
    );

    if (!existingMap) {
      const errorMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.MAP_COULD_NOT_BE_FOUND'
      );

      this.router.navigate(['/'], {
        queryParams: {
          toastMessage: errorMessage,
          toastIsError: 1,
        },
      });
    }

    return existingMap;
  }
}
