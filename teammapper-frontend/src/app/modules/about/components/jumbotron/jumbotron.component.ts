import { Component } from '@angular/core';
import {
  MatList,
  MatListItem,
  MatListItemIcon,
  MatListItemTitle,
} from '@angular/material/list';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'teammapper-jumbotron',
  templateUrl: './jumbotron.component.html',
  styleUrls: ['./jumbotron.component.scss'],
  imports: [
    MatList,
    MatListItem,
    MatIcon,
    MatListItemIcon,
    MatListItemTitle,
    MatButton,
    RouterLink,
    TranslatePipe,
  ],
})
export class JumbotronComponent {
  public projectName: string;
}
