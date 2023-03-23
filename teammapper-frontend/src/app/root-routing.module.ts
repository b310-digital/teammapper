import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [{
  path: '',
  loadChildren: () => import('./modules/start/start.module').then(m => m.StartModule)
}, {
  path: 'map',
  loadChildren: () => import('./modules/application/application.module').then(m => m.ApplicationModule)
}, {
  path: 'map/:id',
  loadChildren: () => import('./modules/application/application.module').then(m => m.ApplicationModule)
}, {
  path: 'app',
  loadChildren: () => import('./modules/application/application.module').then(m => m.ApplicationModule)
}, {
  path: '**',
  redirectTo: ''
}]

@NgModule({
  imports: [RouterModule.forRoot(routes, { onSameUrlNavigation: 'reload' })],
  exports: [RouterModule]
})
export class RootRoutingModule {
}
