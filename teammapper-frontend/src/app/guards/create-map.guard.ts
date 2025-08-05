import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { MapSyncService } from '../core/services/map-sync/map-sync.service';

@Injectable({
  providedIn: 'root',
})
export class CreateMapGuard implements CanActivate {
  constructor(
    private router: Router,
    private mapSyncService: MapSyncService
  ) {}

  async canActivate(): Promise<boolean | UrlTree> {
    // Create a new map and redirect to it
    const privateServerMap = await this.mapSyncService.prepareNewMap();
    return this.router.createUrlTree([`/map/${privateServerMap.map.uuid}`], {
      fragment: privateServerMap.modificationSecret,
    });
  }
}
