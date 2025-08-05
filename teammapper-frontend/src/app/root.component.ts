import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from './core/services/settings/settings.service';
import { ShortcutsService } from './core/services/shortcuts/shortcuts.service';
import { routeAnimation } from './shared/animations/route.animation';

@Component({
  selector: 'teammapper-root',
  templateUrl: 'root.component.html',
  styleUrls: ['./root.component.scss'],
  standalone: false,
  animations: [routeAnimation],
})
export class RootComponent implements OnInit {
  public tapCounter = 0;

  constructor(
    private translateService: TranslateService,
    private router: Router,
    private settingsService: SettingsService,
    private shortcutsService: ShortcutsService
  ) {}

  public async ngOnInit() {
    const settings = this.settingsService.getCachedSettings();

    await this.initTranslations(settings.general.language);

    this.shortcutsService.init();

    // Fix for #347: Force reload of pages in bfcache to prevent broken sync states on macOS where URL and internal state don't match
    window.addEventListener('pageshow', event => {
      if (event.persisted && window.location.pathname.includes('/map')) {
        window.location.reload();
      }
    });
  }

  private async initTranslations(language: string): Promise<void> {
    this.translateService.setDefaultLang(language);
    await this.translateService.use(language).toPromise();
  }
}
