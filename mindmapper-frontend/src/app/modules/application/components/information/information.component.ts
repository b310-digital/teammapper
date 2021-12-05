import {Component} from '@angular/core'
import { environment } from 'src/environments/environment'
import {NotificationService} from '../../../../core/services/notification/notification.service'

@Component({
    selector: 'mindmapp-information',
    templateUrl: './information.component.html',
    styleUrls: ['./information.component.scss']
})
export class InformationComponent {

    environment: any

    constructor (public notificationsService: NotificationService) {
        this.environment = environment
    }

}
