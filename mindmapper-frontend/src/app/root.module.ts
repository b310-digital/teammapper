import { HttpClient, HttpClientModule } from '@angular/common/http'
import { APP_INITIALIZER, NgModule } from '@angular/core'
import { BrowserModule } from '@angular/platform-browser'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { ServiceWorkerModule } from '@angular/service-worker'
import { TranslateLoader, TranslateModule } from '@ngx-translate/core'
import { TranslateHttpLoader } from '@ngx-translate/http-loader'
import { HotkeyModule } from 'angular2-hotkeys'
import { environment } from '../environments/environment'
import { appSettingsFactory, SettingsService } from './core/services/settings/settings.service'
import { RootRoutingModule } from './root-routing.module'
import { RootComponent } from './root.component'
import { SharedModule } from './shared/shared.module'

export function createTranslateLoader (http: HttpClient) {
    return new TranslateHttpLoader(http, './assets/i18n/', '.json')
}

@NgModule({
    imports: [
        BrowserModule,
        SharedModule,
        BrowserAnimationsModule,
        RootRoutingModule,
        HttpClientModule,
        TranslateModule.forRoot({
            loader: {
                provide: TranslateLoader,
                useFactory: (createTranslateLoader),
                deps: [HttpClient]
            }
        }),
        HotkeyModule.forRoot(),
        ServiceWorkerModule.register('ngsw-worker.js', {enabled: environment.production})
    ],
    declarations: [
        RootComponent
    ],
    providers: [
        { provide: APP_INITIALIZER, useFactory: appSettingsFactory, deps: [SettingsService], multi: true },
    ],
    bootstrap: [RootComponent]
})
export class RootModule {
}
