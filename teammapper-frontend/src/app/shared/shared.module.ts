import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { MatLegacySliderModule as MatSliderModule } from '@angular/material/legacy-slider';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacySnackBarModule as MatSnackBarModule } from '@angular/material/legacy-snack-bar';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatLegacyCardModule as MatCardModule } from '@angular/material/legacy-card';
import { MatLegacyListModule as MatListModule } from '@angular/material/legacy-list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatLegacySelectModule as MatSelectModule } from '@angular/material/legacy-select';
import { MatLegacyFormFieldModule as MatFormFieldModule } from '@angular/material/legacy-form-field';
import { MatLegacyInputModule as MatInputModule } from '@angular/material/legacy-input';
import { MatLegacySlideToggleModule as MatSlideToggleModule } from '@angular/material/legacy-slide-toggle';
import { StripTags } from './pipes/striptags.pipe';
import { InverseBoolPipe } from './pipes/inverse-bool.pipe';
import { MatDialogModule } from '@angular/material/dialog';
import { MatGridListModule } from '@angular/material/grid-list';
import { NgOptimizedImage } from '@angular/common';

const PIPES = [StripTags, InverseBoolPipe];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    FontAwesomeModule,
    MatSliderModule,
    RouterModule,
    TranslateModule,
    MatIconModule,
    MatSnackBarModule,
    MatButtonModule,
    MatCardModule,
    MatListModule,
    MatToolbarModule,
    MatDialogModule,
    MatGridListModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    NgOptimizedImage,
  ],
  declarations: [...PIPES],
  exports: [
    CommonModule,
    FormsModule,
    FontAwesomeModule,
    MatSliderModule,
    RouterModule,
    TranslateModule,
    MatIconModule,
    MatSnackBarModule,
    MatButtonModule,
    MatCardModule,
    MatListModule,
    MatToolbarModule,
    MatDialogModule,
    MatGridListModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    NgOptimizedImage,
    ...PIPES,
  ],
})
export class SharedModule {}
