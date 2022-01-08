import {Component} from '@angular/core'

@Component({
  selector: 'teammapper-share-fallback',
  templateUrl: 'share-fallback.component.html',
})
export class ShareFallbackComponent {
  public link: string = window.location.href
}