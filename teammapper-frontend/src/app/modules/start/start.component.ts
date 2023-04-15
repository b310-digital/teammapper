import { Component } from '@angular/core';
import { faGithub } from '@fortawesome/free-brands-svg-icons';

@Component({
  selector: 'teammapper-start',
  templateUrl: './start.component.html',
  styleUrls: ['./start.component.scss'],
})
export class StartComponent {
  public projectName: string;
  public faGithub = faGithub;
  public breakpoint: number;
  public height: number;

  constructor() {
    this.breakpoint = 1;
  }

  ngOnInit() {
    this.breakpoint = window.innerWidth <= 990 ? 1 : 2;
    this.height = window.innerHeight;
  }

  onResize(event: Event) {
    this.breakpoint = (event.target as Window).innerWidth <= 990 ? 1 : 2;
    this.height = window.innerHeight;
  }
}
