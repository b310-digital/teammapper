import { Routes } from '@angular/router';
import { SettingsComponent } from './pages/settings/settings.component';
import { ShortcutsComponent } from './pages/shortcuts/shortcuts.component';

export const appRoutes: Routes = [
  {
    path: 'settings',
    component: SettingsComponent,
  },
  {
    path: 'shortcuts',
    component: ShortcutsComponent,
  },
];
