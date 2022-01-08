import {Component, OnInit } from '@angular/core'
import {faGithub} from '@fortawesome/free-brands-svg-icons'

@Component({
    selector: 'teammapper-start',
    templateUrl: './start.component.html',
    styleUrls: ['./start.component.scss']
})
export class StartComponent {

    public projectName: string
    public faGithub = faGithub

    constructor () {
    }
}
