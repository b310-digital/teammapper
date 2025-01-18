import {
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { HotkeyModule } from 'angular2-hotkeys';
import {
  appSettingsFactory,
  SettingsService,
} from './core/services/settings/settings.service';
import { RootRoutingModule } from './root-routing.module';
import { RootComponent } from './root.component';
import { SharedModule } from './shared/shared.module';
import { ToastrModule } from 'ngx-toastr';

export function createTranslateLoader(http: HttpClient) {
  return new TranslateHttpLoader(http, '/assets/i18n/', '.json');
}

@NgModule({
  declarations: [RootComponent],
  bootstrap: [RootComponent],
  imports: [
    BrowserModule,
    SharedModule,
    BrowserAnimationsModule,
    ToastrModule.forRoot(),
    RootRoutingModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient],
      },
    }),
    HotkeyModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: appSettingsFactory,
      deps: [SettingsService],
      multi: true,
    },
    provideHttpClient(withInterceptorsFromDi()),
  ],
})
export class RootModule {}
