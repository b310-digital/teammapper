import { Routes } from '@angular/router';
import { ToastGuard } from './guards/toast.guard';
import { NotFoundComponent } from './not-found';
import { aboutRoutes } from './modules/about/about.routes';
import { applicationRoutes } from './modules/application/application.routes';
import { appRoutes } from './modules/application/app.routes';

export const rootRoutes: Routes = [
  {
    path: '',
    children: aboutRoutes,
    canActivate: [ToastGuard],
  },
  {
    path: 'map',
    children: applicationRoutes,
    canActivate: [ToastGuard],
  },
  {
    path: 'app',
    children: appRoutes,
  },
  {
    path: '**',
    component: NotFoundComponent,
  },
];
