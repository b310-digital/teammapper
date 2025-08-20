import {
  enableProdMode,
  APP_INITIALIZER,
  importProvidersFrom,
} from '@angular/core';

import { createTranslateLoader } from './app/root.module';
import { environment } from './environments/environment';
import {
  appSettingsFactory,
  SettingsService,
} from './app/core/services/settings/settings.service';
import {
  provideHttpClient,
  withInterceptorsFromDi,
  HttpClient,
} from '@angular/common/http';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { HotkeyModule } from 'angular2-hotkeys';
import { RootComponent } from './app/root.component';
import { provideRouter } from '@angular/router';
import { rootRoutes } from './app/root.routes';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(RootComponent, {
  providers: [
    importProvidersFrom(
      BrowserModule,
      ToastrModule.forRoot(),
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: createTranslateLoader,
          deps: [HttpClient],
        },
      }),
      HotkeyModule.forRoot()
    ),
    provideRouter(rootRoutes),
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
