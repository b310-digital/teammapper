import { Routes } from '@angular/router';
import { AboutComponent } from './pages/about/about.component';
import { LegalComponent } from './pages/legal/legal.component';
import { PrivacyComponent } from './pages/privacy/privacy.component';

export const aboutRoutes: Routes = [
  {
    path: '',
    component: AboutComponent,
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
