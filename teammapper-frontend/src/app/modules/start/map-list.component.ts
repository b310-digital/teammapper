import { Component, ElementRef, Renderer2, ViewChild } from '@angular/core';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { CachedAdminMapEntry } from 'src/app/shared/models/cached-map.model';
import { Router } from '@angular/router';

@Component({
  selector: 'map-list',
  templateUrl: './map-list.component.html',
  styleUrls: ['./map-list.component.scss'],
})
export class MapListComponent {
  public cachedAdminMapEntries: CachedAdminMapEntry[];

  constructor(
    private settingsService: SettingsService,
    private router: Router
  ) {
    this.cachedAdminMapEntries = [];
    console.log('test');
  }

  async ngOnInit() {
    this.cachedAdminMapEntries = (
      await this.settingsService.getCachedAdminMapEntries()
    ).splice(0, 3);
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
