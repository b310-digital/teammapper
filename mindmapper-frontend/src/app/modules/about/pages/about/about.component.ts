import {Component, OnInit} from '@angular/core'
import {faBrain, faChartLine, faCheck, faCogs, faHeart, faRocket} from '@fortawesome/free-solid-svg-icons'

@Component({
    selector: 'mindmapper-about',
    templateUrl: './about.component.html',
    styleUrls: ['./about.component.scss']
})
export class AboutComponent {

    public faBrain = faBrain
    public faRocket = faRocket
    public faHeart = faHeart
    public faChartLine = faChartLine
    public faCogs = faCogs
    public faCheck = faCheck

    constructor () {
    }

}
