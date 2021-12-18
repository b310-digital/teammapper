import {Component} from '@angular/core'

@Component({
    selector: 'mindmapper-share-fallback',
    templateUrl: 'share-fallback.component.html',
  })
  export class ShareFallbackComponent {
    public link: string = window.location.href
  }