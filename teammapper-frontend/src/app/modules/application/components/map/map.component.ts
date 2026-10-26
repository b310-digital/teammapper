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
import { CachedMapEntry } from '@teammapper/shared';

import { first, Subscription } from 'rxjs';

@Component({
  selector: 'teammapper-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private mmpService = inject(MmpService);
  private mapSyncService = inject(MapSyncService);

  readonly mapWrapper = viewChild.required<ElementRef<HTMLElement>>('map');

  private mapSyncServiceSubscription: Subscription | null = null;

  public ngAfterViewInit() {
    this.mapSyncServiceSubscription = this.mapSyncService
      .getAttachedMapObservable()
      .pipe(first((val: CachedMapEntry | null) => val !== null))
      .subscribe(() => {
        // MapSyncService creates the map once the connection syncs.
        this.mapSyncService.openMap(this.mapWrapper().nativeElement);
      });
  }

  ngOnDestroy() {
    this.mapSyncService.reset();
    this.mmpService.remove();
    this.mapSyncServiceSubscription?.unsubscribe();
  }
}
