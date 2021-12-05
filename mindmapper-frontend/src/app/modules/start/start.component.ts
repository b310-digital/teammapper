import {Component, OnInit } from '@angular/core'
import {UtilsService} from '../../core/services/utils/utils.service'

@Component({
    selector: 'mindmapp-start',
    templateUrl: './start.component.html',
    styleUrls: ['./start.component.scss']
})
export class StartComponent implements OnInit {

    public projectName: string

    constructor () {
    }

    public ngOnInit () {
    }

}
