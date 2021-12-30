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

    public initImageUpload(event: InputEvent) {
        const fileReader = new FileReader()

        fileReader.onload = (fileEvent: any) => {
                // in case file is an image resize it
                const img = new Image() // create a image
                img.src = fileEvent.target.result // result is base64-encoded Data URI
                img.onload = (el: any) => {
                    const resizeWidth = 360 // without px
                    const elem = document.createElement('canvas') // create a canvas

                    // scale the image to 360 (width) and keep aspect ratio
                    const scaleFactor = resizeWidth / el.target.width
                    elem.width = resizeWidth
                    elem.height = el.target.height * scaleFactor

                    // draw in canvas
                    const ctx = elem.getContext('2d')
                    ctx.drawImage(el.target, 0, 0, elem.width, elem.height)

                    // set target value to empty string, otherwise new uploads are not triggered
                    fileEvent.target.value = '';
                    // get the base64-encoded Data URI from the resize image
                    this.mmpService.addNodeImage(ctx.canvas.toDataURL(el.target, 'image/jpeg'))
                }
            }
            const fileUpload: HTMLInputElement = event.target as HTMLInputElement 
            fileReader.readAsDataURL(fileUpload.files[0])
    }

    public initJSONUpload(event: InputEvent) {
        const fileReader = new FileReader()

        fileReader.onload = (_fileEvent: any) => {
            this.mmpService.importMap(fileReader.result.toString())
        }

        const fileUpload: HTMLInputElement = event.target as HTMLInputElement 
        fileReader.readAsText(fileUpload.files[0])
    }
}
