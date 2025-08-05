import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ApplicationComponent } from './pages/application/application.component';
import { CreateMapGuard } from '../../guards/create-map.guard';

const routes: Routes = [
  {
    path: '',
    canActivate: [CreateMapGuard],
    component: ApplicationComponent,
  },
  {
    path: ':id',
    component: ApplicationComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ApplicationRoutingModule {}
