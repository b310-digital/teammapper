import { Component } from '@angular/core';
import { faGithub, faGitter } from '@fortawesome/free-brands-svg-icons';

@Component({
  selector: 'teammapper-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: false,
})
export class HeaderComponent {
  public faGithub = faGithub;
  public faGitter = faGitter;
}
