import { Component, OnInit } from '@angular/core';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { SettingsService } from 'src/app/core/services/settings/settings.service';
import { CachedAdminMapEntry } from 'src/app/shared/models/cached-map.model';
import { Router } from '@angular/router';

@Component({
  selector: 'teammapper-start',
  templateUrl: './start.component.html',
  styleUrls: ['./start.component.scss'],
})
export class StartComponent implements OnInit {
  public projectName: string;
  public faGithub = faGithub;
  public breakpoint: number;
  public height: number;
  public cachedAdminMapEntries: CachedAdminMapEntry[];

  constructor(
    private settingsService: SettingsService,
    private router: Router
  ) {
    this.breakpoint = 1;
    this.cachedAdminMapEntries = [];
  }

  async ngOnInit() {
    this.breakpoint = window.innerWidth <= 990 ? 1 : 2;
    this.height = window.innerHeight;
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

  onResize(event: Event) {
    this.breakpoint = (event.target as Window).innerWidth <= 990 ? 1 : 2;
    this.height = window.innerHeight;
  }
}
