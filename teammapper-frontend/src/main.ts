import {
  enableProdMode,
  APP_INITIALIZER,
  EnvironmentProviders,
  importProvidersFrom,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { environment } from './environments/environment';
import {
  appSettingsFactory,
  SettingsService,
} from './app/core/services/settings/settings.service';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { TranslateModule } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { HotkeyModule } from 'angular2-hotkeys';
import { RootComponent } from './app/root.component';
import { provideRouter, withHashLocation } from '@angular/router';
import { rootRoutes } from './app/root.routes';
import { provideRemoteMapBackend } from './app/core/services/map-backend/remote/remote-map-backend.providers';
import { provideServiceWorker } from '@angular/service-worker';
import { AppUpdateService } from './app/core/services/app-update/app-update.service';

if (environment.production) {
  enableProdMode();
}

/**
 * Provides the map backend of the build. The web build drops the offline
 * branch before bundling. The dynamic imports keep the local backend and
 * y-indexeddb out of the main chunk even if tree-shaking keeps the branch.
 * Keep the offline code inside the `if` block: after an early
 * `if (!TEAMMAPPER_OFFLINE) return`, esbuild keeps the rest and the web build
 * emits a chunk for each import.
 */
async function provideMapBackend(): Promise<EnvironmentProviders> {
  if (TEAMMAPPER_OFFLINE) {
    const { provideLocalMapBackend } =
      await import('./app/core/services/map-backend/local/local-map-backend.providers');
    return provideLocalMapBackend(() => import('y-indexeddb'));
  }
  return provideRemoteMapBackend();
}

/**
 * Starts the app with the given map backend.
 *
 * @param mapBackend providers of the map store and the map connections
 */
function bootstrap(mapBackend: EnvironmentProviders) {
  return bootstrapApplication(RootComponent, {
    providers: [
      importProvidersFrom(
        BrowserModule,
        ToastrModule.forRoot(),
        TranslateModule.forRoot(),
        HotkeyModule.forRoot()
      ),
      provideTranslateHttpLoader({
        prefix: './assets/i18n/',
        suffix: '.json',
      }),
      // A static host has no rewrite rules, so the offline build keeps the
      // route in the hash.
      provideRouter(
        rootRoutes,
        ...(TEAMMAPPER_OFFLINE ? [withHashLocation()] : [])
      ),
      mapBackend,
      // The service worker caches the site, so the offline build loads
      // without a network once a visitor has opened it. The web build
      // registers none, and neither does a development build.
      ...(TEAMMAPPER_OFFLINE
        ? [
            provideServiceWorker('ngsw-worker.js', {
              enabled: environment.production,
              registrationStrategy: 'registerWhenStable:30000',
            }),
            provideAppInitializer(() => inject(AppUpdateService).watch()),
          ]
        : []),
      {
        provide: APP_INITIALIZER,
        useFactory: appSettingsFactory,
        deps: [SettingsService],
        multi: true,
      },
      provideHttpClient(withInterceptorsFromDi()),
      provideAnimations(),
    ],
  });
}

provideMapBackend().then(bootstrap).catch(console.error);
