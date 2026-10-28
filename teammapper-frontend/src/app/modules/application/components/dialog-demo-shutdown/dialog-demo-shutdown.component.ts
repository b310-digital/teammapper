import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Warns on every opened map that the demo instance closes and asks the user
 * to save their mind maps. A direct link skips the landing page and its
 * warning, so the map page shows this dialog as well.
 */
@Component({
  selector: 'teammapper-dialog-demo-shutdown',
  templateUrl: './dialog-demo-shutdown.component.html',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButton,
    TranslatePipe,
  ],
})
export class DialogDemoShutdownComponent {}
