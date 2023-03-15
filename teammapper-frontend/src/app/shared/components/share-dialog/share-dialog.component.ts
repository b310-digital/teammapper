import { Component, ElementRef, ViewChild, OnInit } from '@angular/core'
import QRCodeStyling from 'qr-code-styling'

@Component({
  selector: 'teammapper-share-dialog',
  templateUrl: 'share-dialog.component.html',
  styleUrls: ['share-dialog.component.scss']
})
export class ShareDialogComponent implements OnInit {
  @ViewChild('qrcodecanvas', { static: true }) qrCodeCanvas: ElementRef<HTMLCanvasElement>
  @ViewChild('sharedialog', { static: true }) shareDialog: ElementRef<HTMLElement>
  @ViewChild('inputlink', { static: true }) inputLink: ElementRef<HTMLInputElement>

  public editableLink: string = window.location.href
  public nonEditableLinks: string = window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search
  public qrCode: QRCodeStyling
  public showEditableLink: boolean = false

  ngOnInit () {
    this.appendQrCode()
  }

  appendQrCode () {
    const size: number = window.innerWidth > 400 ? 300 : 200

    this.qrCode = new QRCodeStyling({
      width: size,
      height: size,
      type: 'svg',
      image: '',
      dotsOptions: {
        color: '#000000',
        type: 'dots'
      },
      cornersSquareOptions: {
        type: 'square'
      },
      cornersDotOptions: {
        type: 'dot'
      },
      backgroundOptions: {
        color: '#fff'
      },
      imageOptions: {
        crossOrigin: 'anonymous',
        margin: 20
      },
      data: this.getLink()
    })
    this.qrCodeCanvas.nativeElement.innerHTML = ''
    this.qrCode.append(this.qrCodeCanvas.nativeElement)
  }

  downloadQrCode () {
    this.qrCode.download()
  }

  isShareable () {
    return !!(window.navigator as any)?.share
  }

  getLink() {
    return this.showEditableLink ? this.editableLink : this.nonEditableLinks
  }

  copy () {
    this.inputLink.nativeElement.select()
    navigator.clipboard.writeText(this.getLink())
  }

  setShowEditableLink(value: boolean) {
    this.showEditableLink = value
    this.appendQrCode()
  }

  async share () {
    if ((window.navigator as any)?.share) {
      await (window.navigator as any)?.share({
        title: 'TeamMapper',
        url: this.getLink()
      })
    } else {
      this.shareDialog.nativeElement.style.display = 'block'
    }
  }
}
