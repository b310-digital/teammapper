import { NgModule } from '@angular/core'
import { ApplicationRoutingModule } from './application-routing.module'
import { SharedModule } from '../../shared/shared.module'
import { ColorPanelsComponent } from './components/color-panels/color-panels.component'
import { SliderPanelsComponent } from './components/slider-panels/slider-panels.component'
import { FloatingButtonsComponent } from './components/floating-buttons/floating-buttons.component'
import { MapComponent } from './components/map/map.component'
import { ApplicationComponent } from './pages/application/application.component'
import { SettingsComponent } from './pages/settings/settings.component'
import { ShortcutsComponent } from './pages/shortcuts/shortcuts.component'
import { ToolbarComponent } from './components/toolbar/toolbar.component'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatMenuModule } from '@angular/material/menu'
import { MatInputModule } from '@angular/material/input'
import { MatTabsModule } from '@angular/material/tabs'
import { MatDialogModule } from '@angular/material/dialog'
import { ClientColorPanelsComponent } from './components/client-color-panels/client-color-panels.component'

@NgModule({
  imports: [
  SharedModule,
  MatInputModule,
  MatMenuModule,
  MatSlideToggleModule,
  MatTabsModule,
  ApplicationRoutingModule,
  MatDialogModule
  ],
  declarations: [
  ApplicationComponent,
  SettingsComponent,
  ShortcutsComponent,
  ClientColorPanelsComponent,
  ColorPanelsComponent,
  FloatingButtonsComponent,
  MapComponent,
  SliderPanelsComponent,
  ToolbarComponent
  ]
  })
export class ApplicationModule {

}
