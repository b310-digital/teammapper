import {
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  inject,
  viewChild,
} from '@angular/core';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { CachedMapEntry } from '@teammapper/shared';
import { Router } from '@angular/router';

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
  private router = inject(Router);

  readonly mapWrapper = viewChild.required<ElementRef<HTMLElement>>('map');

  private mapSyncServiceSubscription: Subscription | null = null;

  public ngAfterViewInit() {
    const settings = this.settingsService.getCachedUserSettings();

    this.mapSyncServiceSubscription = this.mapSyncService
      .getAttachedMapObservable()
      .pipe(first((val: CachedMapEntry | null) => val !== null))
      .subscribe(() => {
        // With no cached settings mmp falls back to its own defaults rather
        // than refusing to draw the map. MapSyncService creates the map once
        // the connection syncs.
        this.mapSyncService.openMap(
          this.mapWrapper().nativeElement,
          settings?.mapOptions
        );
      });
  }

  ngOnDestroy() {
    const nextPath = this.router
      .currentNavigation()
      ?.finalUrl?.toString()
      .split(/[?#]/)[0];
    if (nextPath === '/app/settings') this.mapSyncService.detachMap();
    else this.mapSyncService.reset();
    this.mmpService.remove();
    this.mapSyncServiceSubscription?.unsubscribe();
  }
}
