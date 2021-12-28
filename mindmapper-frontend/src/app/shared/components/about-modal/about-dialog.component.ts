import {Component, Inject} from '@angular/core'
import {MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import {faGithub, faGitter} from '@fortawesome/free-brands-svg-icons'
import { environment } from '../../../../environments/environment'

@Component({
    selector: 'mindmapper-about-dialog',
    templateUrl: 'about-dialog.component.html',
    styleUrls: ['./about-dialog.component.scss']
  })
  export class AboutDialogComponent {

    public faGithub = faGithub
    public faGitter = faGitter
    public version: string

    constructor(
      public dialogRef: MatDialogRef<AboutDialogComponent>,
      @Inject(MAT_DIALOG_DATA) public data: {deletedAt: Date, deleteAfterDays: number}
      ) {

      this.version = environment.version
    }
  }