import {
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  AfterViewInit,
  inject,
} from '@angular/core';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { CachedMapEntry } from 'src/app/shared/models/cached-map.model';

import { first, Subscription } from 'rxjs';

@Component({
  selector: 'teammapper-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private settingsService = inject(SettingsService);
  private mmpService = inject(MmpService);
  private mapSyncService = inject(MapSyncService);

  @ViewChild('map') mapWrapper: ElementRef<HTMLElement>;

  private mapSyncServiceSubscription: Subscription;

  public async ngAfterViewInit() {
    const settings = this.settingsService.getCachedUserSettings();

    this.mapSyncServiceSubscription = this.mapSyncService
      .getAttachedMapObservable()
      .pipe(first((val: CachedMapEntry | null) => val !== null))
      .subscribe(async (_result: CachedMapEntry | null) => {
        await this.mmpService.create(
          'map_1',
          this.mapWrapper.nativeElement,
          settings.mapOptions
        );
        this.mapSyncService.initMap();
      });
  }

  ngOnDestroy() {
    this.mapSyncService.reset();
    this.mmpService.remove();
    this.mapSyncServiceSubscription.unsubscribe();
  }
}
