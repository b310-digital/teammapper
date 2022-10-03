import { Component } from '@angular/core'
import { faGithub, faGitter } from '@fortawesome/free-brands-svg-icons'

@Component({
  selector: 'teammapper-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  public faGithub = faGithub
  public faGitter = faGitter

  constructor () {
  }

  public slide (selector: string, event: Event) {
    if (selector) {
      event.preventDefault()
      const element = document.querySelector(selector)

      window.scrollTo({
        behavior: 'smooth',
        top: element.getBoundingClientRect().top + window.scrollY - 70
      })
    }
  }
}
