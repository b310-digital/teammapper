import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ToastGuard } from './guards/toast.guard';

const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./modules/about/about.module').then(m => m.AboutModule),
    canActivate: [ToastGuard],
>>>>>>> upstream/main
  },
  {
    path: 'map',
    loadChildren: () =>
      import('./modules/application/application.module').then(
        m => m.ApplicationModule
      ),
    canActivate: [ToastGuard],
  },
  {
    path: 'map/:id',
    loadChildren: () =>
      import('./modules/application/application.module').then(
        m => m.ApplicationModule
      ),
    canActivate: [ToastGuard],
  },
  {
    path: 'app',
    loadChildren: () =>
      import('./modules/application/application.module').then(
        m => m.ApplicationModule
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      onSameUrlNavigation: 'reload',
      scrollPositionRestoration: 'enabled',
    }),
  ],
  exports: [RouterModule],
})
export class RootRoutingModule {}
