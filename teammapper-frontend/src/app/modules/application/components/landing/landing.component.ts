import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MapSyncService } from '../../../../core/services/map-sync/map-sync.service';

@Component({
  selector: 'teammapper-landing',
  template: '',
})
export class LandingComponent implements OnInit {
  constructor(
    private router: Router,
    private mapSyncService: MapSyncService
  ) {}

  async ngOnInit(): Promise<void> {
    const privateServerMap = await this.mapSyncService.prepareNewMap();
    await this.router.navigate(['/map', privateServerMap.map.uuid], {
      fragment: privateServerMap.modificationSecret,
    });
  }
}
