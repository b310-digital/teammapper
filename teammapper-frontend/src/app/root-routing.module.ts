import {NgModule} from '@angular/core'
import {RouterModule, Routes} from '@angular/router'

const routes: Routes = [{
  path: '',
  loadChildren: () => import('./modules/start/start.module').then(m => m.StartModule)
}, {
  path: 'app',
  loadChildren: () => import('./modules/application/application.module').then(m => m.ApplicationModule)
}, {
  path: 'mmp/:id',
  loadChildren: () => import('./modules/application/application.module').then(m => m.ApplicationModule)
}, {
  path: '**',
  redirectTo: ''
}]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class RootRoutingModule {
}
