import { NgModule } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { StartRoutingModule } from './start-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { StartComponent } from './start.component';
import { MapListComponent } from './map-list.component';

@NgModule({
  imports: [SharedModule, StartRoutingModule, MatGridListModule],
  declarations: [StartComponent, MapListComponent],
})
export class StartModule {}
