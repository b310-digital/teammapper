import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ToastGuard } from './guards/toast.guard';
import { NotFoundComponent } from './not-found';

const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./modules/about/about.module').then(m => m.AboutModule),
    canActivate: [ToastGuard],
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
    component: NotFoundComponent,
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes),
  ],
  exports: [RouterModule],
})
export class RootRoutingModule {}
