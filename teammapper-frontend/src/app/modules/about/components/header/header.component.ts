import { Component } from '@angular/core';
import { faGithub, faGitter } from '@fortawesome/free-brands-svg-icons';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';

@Component({
  selector: 'teammapper-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [FaIconComponent],
})
export class HeaderComponent {
  public faGithub = faGithub;
  public faGitter = faGitter;
}
