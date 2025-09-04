import { Routes } from '@angular/router';
import { ApplicationComponent } from './pages/application/application.component';
import { LandingComponent } from './components/landing/landing.component';

export const applicationRoutes: Routes = [
  {
    path: '',
    component: LandingComponent,
  },
  {
    path: ':id',
    component: ApplicationComponent,
  },
];
