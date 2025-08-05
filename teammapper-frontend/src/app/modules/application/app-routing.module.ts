import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SettingsComponent } from './pages/settings/settings.component';
import { ShortcutsComponent } from './pages/shortcuts/shortcuts.component';

const routes: Routes = [
  {
    path: 'settings',
    component: SettingsComponent,
  },
  {
    path: 'shortcuts',
    component: ShortcutsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
