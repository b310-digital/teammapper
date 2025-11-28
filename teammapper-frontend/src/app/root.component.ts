import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from './core/services/settings/settings.service';
import { ShortcutsService } from './core/services/shortcuts/shortcuts.service';
import { routeAnimation } from './shared/animations/route.animation';

@Component({
  selector: 'teammapper-root',
  templateUrl: 'root.component.html',
  styleUrls: ['./root.component.scss'],
  animations: [routeAnimation],
  imports: [RouterOutlet],
})
export class RootComponent implements OnInit {
  private translateService = inject(TranslateService);
  private router = inject(Router);
  private settingsService = inject(SettingsService);
  private shortcutsService = inject(ShortcutsService);

  public tapCounter = 0;

  public async ngOnInit() {
    const settings = this.settingsService.getCachedUserSettings();

    await this.initTranslations(settings.general.language);

    this.shortcutsService.init();

    // Fix for #347: Force reload of pages in bfcache to prevent broken sync states on macOS where URL and internal state don't match
    // Only apply this fix when the page is actually restored from bfcache (event.persisted = true)
    window.addEventListener('pageshow', event => {
      // Only reload if the page was actually cached and restored (not on initial load)
      if (event.persisted && window.location.pathname.includes('/map')) {
        console.warn(
          'Page restored from bfcache, reloading to ensure correct state'
        );
        window.location.reload();
      }
    });
  }

  private async initTranslations(language: string): Promise<void> {
    this.translateService.setDefaultLang(language);
    await this.translateService.use(language).toPromise();
  }
}
