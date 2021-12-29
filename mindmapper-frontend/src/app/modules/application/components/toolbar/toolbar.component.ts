import {Component, Input} from '@angular/core'
import { DialogService } from 'src/app/shared/services/dialog/dialog.service'
import {MmpService} from '../../../../core/services/mmp/mmp.service'
import {UtilsService} from '../../../../core/services/utils/utils.service'

@Component({
    selector: 'mindmapper-toolbar',
    templateUrl: './toolbar.component.html',
    styleUrls: ['./toolbar.component.scss']
})
export class ToolbarComponent {

    @Input() public node: any

    constructor (public mmpService: MmpService, public dialogService: DialogService) {
    }

    public exportMap (format: string) {
        this.mmpService.exportMap(format)
    }

    public async share () {
        if ((window.navigator as any)?.share) {
            await (window.navigator as any)?.share({
              title: 'Mindmapper',
              url: window.location.href,
            })
          } else {
            this.dialogService.openShareDialog()
          }
    }

    public toggleFullScreen () {
        UtilsService.toggleFullScreen()
    }

    public toogleNodeFontStyle () {
        const currentStyle = this.mmpService.selectNode().font.style

        if (currentStyle === 'italic') {
            this.mmpService.updateNode('fontStyle', 'normal')
        } else {
            this.mmpService.updateNode('fontStyle', 'italic')
        }
    }

    public toogleNodeFontWeight () {
        const currentWeight = this.mmpService.selectNode().font.weight

        if (currentWeight === 'bold') {
            this.mmpService.updateNode('fontWeight', 'normal')
        } else {
            this.mmpService.updateNode('fontWeight', 'bold')
        }
    }

    public async openAbout () {
        this.dialogService.openAboutDialog()
    }

}
