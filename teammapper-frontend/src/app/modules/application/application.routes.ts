import { Routes } from '@angular/router';
import { ApplicationComponent } from './pages/application/application.component';
import { LandingComponent } from './components/landing/landing.component';
import { LegalComponent } from '../about/pages/legal/legal.component';
import { PrivacyComponent } from '../about/pages/privacy/privacy.component';

export const applicationRoutes: Routes = [
  {
    path: '',
    component: LandingComponent,
  },
  {
    path: ':id',
    component: ApplicationComponent,
  },
  {
    path: 'legal',
    component: LegalComponent,
  },
  {
    path: 'privacy',
    component: PrivacyComponent,
  },
];
