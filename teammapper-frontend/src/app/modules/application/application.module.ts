import { NgModule } from '@angular/core';
import { ApplicationRoutingModule } from './application-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { MatTabsModule } from '@angular/material/tabs';
import { ColorPanelsComponent } from './components/color-panels/color-panels.component';
import { SliderPanelsComponent } from './components/slider-panels/slider-panels.component';
import { FloatingButtonsComponent } from './components/floating-buttons/floating-buttons.component';
import { MapComponent } from './components/map/map.component';
import { ApplicationComponent } from './pages/application/application.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { ShortcutsComponent } from './pages/shortcuts/shortcuts.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { ClientColorPanelsComponent } from './components/client-color-panels/client-color-panels.component';
import { ColorPickerModule } from 'ngx-color-picker';
import { DialogAboutComponent } from './components/dialog-about/dialog-about.component';
import { DialogShareComponent } from './components/dialog-share/dialog-share.component';
import { DialogConnectionInfoComponent } from './components/dialog-connection-info/dialog-connection-info.component';
import { DialogPictogramsComponent } from './components/dialog-pictograms/dialog-pictograms.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule } from '@angular/material/dialog';
import { MatGridListModule } from '@angular/material/grid-list';
import { DialogImportMermaidComponent } from './components/dialog-import-mermaid/dialog-import-mermaid.component';

@NgModule({
  imports: [
    SharedModule,
    MatMenuModule,
    MatTabsModule,
    ApplicationRoutingModule,
    ColorPickerModule,
    MatDialogModule,
    MatGridListModule,
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
    ToolbarComponent,
    DialogConnectionInfoComponent,
    DialogShareComponent,
    DialogImportMermaidComponent,
    DialogPictogramsComponent,
    DialogAboutComponent,
  ],
})
export class ApplicationModule {}
