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
import { SharedModule } from './app/shared/shared.module';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { RootRoutingModule } from './app/root-routing.module';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { HotkeyModule } from 'angular2-hotkeys';
import { RootComponent } from './app/root.component';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(RootComponent, {
  providers: [
    importProvidersFrom(
      BrowserModule,
      SharedModule,
      ToastrModule.forRoot(),
      RootRoutingModule,
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: createTranslateLoader,
          deps: [HttpClient],
        },
      }),
      HotkeyModule.forRoot()
    ),
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
