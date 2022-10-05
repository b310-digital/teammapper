import { Component, Input } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { DialogService } from 'src/app/shared/services/dialog/dialog.service'
import { MmpService } from '../../../../core/services/mmp/mmp.service'

@Component({
  selector: 'teammapper-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss']
})
export class ToolbarComponent {
  @Input() public node: any

  constructor (public mmpService: MmpService, public dialogService: DialogService, public translationService: TranslateService) {
  }

  public exportMap (format: string) {
    this.mmpService.exportMap(format)
  }

  public async share () {
    this.dialogService.openShareDialog()
  }

  public toogleNodeFontStyle () {
    const currentStyle = this.mmpService.selectNode().font.style

    if (currentStyle === 'italic') {
      this.mmpService.updateNode('fontStyle', 'normal')
    } else {
      this.mmpService.updateNode('fontStyle', 'italic')
    }
  }

  public addLink () {
    const linkInput = prompt(this.translationService.instant('MODALS.LINK.URL')) || window.location.href
    const validatedLink = this.isValidLink(linkInput) ? linkInput : window.location.href
    const linkName = prompt(this.translationService.instant('MODALS.LINK.NAME')) || 'Link'
    this.mmpService.updateNode(
      'name',
      `<a href="${validatedLink}" target="_blank" contenteditable="false" style="color:#00a3d3;"><mat-icon role="img" class="mat-icon notranslate material-icons mat-icon-no-color" style="vertical-align: middle;">insert_link</mat-icon>${linkName}</a>`
    )
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

  public initImageUpload (event: InputEvent) {
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
        fileEvent.target.value = ''
        // get the base64-encoded Data URI from the resize image
        this.mmpService.addNodeImage(ctx.canvas.toDataURL())
      }
    }
    const fileUpload: HTMLInputElement = event.target as HTMLInputElement
    fileReader.readAsDataURL(fileUpload.files[0])
  }

  public initJSONUpload (event: InputEvent) {
    const fileReader = new FileReader()

    fileReader.onload = (_fileEvent: any) => {
      this.mmpService.importMap(fileReader.result.toString())
    }

    const fileUpload: HTMLInputElement = event.target as HTMLInputElement
    fileReader.readAsText(fileUpload.files[0])
  }

  private isValidLink (input: string) {
    try {
      new URL(input)
    } catch (_) {
      return false
    }
    return true
  }
}
