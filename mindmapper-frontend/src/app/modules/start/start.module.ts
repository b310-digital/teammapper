import {NgModule} from '@angular/core'
import {StartRoutingModule} from './start-routing.module'
import {SharedModule} from '../../shared/shared.module'
import {StartComponent} from './start.component'

@NgModule({
    imports: [
        SharedModule,
        StartRoutingModule
    ],
    declarations: [
        StartComponent
    ]
})
export class StartModule {
}
