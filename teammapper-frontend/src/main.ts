import {
  enableProdMode,
  APP_INITIALIZER,
  importProvidersFrom,
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
import { provideRouter } from '@angular/router';
import { rootRoutes } from './app/root.routes';
import { provideRemoteMapBackend } from './app/core/services/map-backend/remote/remote-map-backend.providers';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(RootComponent, {
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
    provideRouter(rootRoutes),
    provideRemoteMapBackend(),
    {
      provide: APP_INITIALIZER,
      useFactory: appSettingsFactory,
      deps: [SettingsService],
      multi: true,
    },
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
  ],
}).catch(console.error);
