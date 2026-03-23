import { Component, inject, OnInit, signal } from '@angular/core';
import { CachedAdminMapEntry } from '../../models/cached-map.model';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { MapSyncService } from 'src/app/core/services/map-sync/map-sync.service';
import { Router } from '@angular/router';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from '@angular/material/card';
import { MatList, MatListItem } from '@angular/material/list';
import { MatLine } from '@angular/material/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'teammapper-mindmaps-overview',
  templateUrl: './mindmaps-overview.component.html',
  styleUrl: './mindmaps-overview.component.scss',
  imports: [
    MatCard,
    MatCardHeader,
    MatCardContent,
    MatCardTitle,
    MatList,
    MatListItem,
    MatLine,
    DatePipe,
    TranslatePipe,
    CommonModule,
  ],
})
export class MindmapsOverview implements OnInit {
  private settingsService = inject(SettingsService);
  private mapSyncService = inject(MapSyncService);
  private router = inject(Router);

  public cachedAdminMapEntries = signal<CachedAdminMapEntry[]>([]);
  public ownedEntries = signal<CachedAdminMapEntry[]>([]);

  public async ngOnInit() {
    this.cachedAdminMapEntries.set(
      await this.settingsService.getCachedAdminMapEntries()
    );
    this.ownedEntries.set(await this.mapSyncService.fetchUserMapsFromServer());
  }

  public getMapUrl(entry: CachedAdminMapEntry): string {
    return this.router
      .createUrlTree([`/map/${entry.id}`], {
        fragment: entry.cachedAdminMapValue.modificationSecret,
      })
      .toString();
  }

  public getMapTitle(entry: CachedAdminMapEntry): string {
    return entry.cachedAdminMapValue.rootName || entry.id;
  }
}
