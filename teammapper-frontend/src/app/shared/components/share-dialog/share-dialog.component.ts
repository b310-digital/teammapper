import {Component, ElementRef, ViewChild, OnInit} from '@angular/core'
import QRCodeStyling from 'qr-code-styling'

@Component({
  selector: 'teammapper-share-dialog',
  templateUrl: 'share-dialog.component.html',
  styleUrls: ['share-dialog.component.scss']
})
export class ShareDialogComponent implements OnInit{
  @ViewChild("qrcodecanvas", { static: true }) qrCodeCanvas: ElementRef<HTMLCanvasElement>;
  @ViewChild("sharedialog", { static: true }) shareDialog: ElementRef<HTMLElement>;
  
  public link: string = window.location.href

  ngOnInit() {
    const size: number = window.innerWidth > 400 ? 300 : 200
    const qrCode: QRCodeStyling = new QRCodeStyling({
      width: size,
      height: size,
      type: 'svg',
      image: "",
      dotsOptions: {
        color: '#000000',
        type: "dots",
      },
      cornersSquareOptions: {
        type: 'square'
      },
      cornersDotOptions: {
        type: 'dot'
      },
      backgroundOptions: {
        color: "#fff",
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 20,
      },
      data: window.location.href
    });
    qrCode.append(this.qrCodeCanvas.nativeElement);
  }

  async share() {
    if ((window.navigator as any)?.share) {
      await (window.navigator as any)?.share({
        title: 'TeamMapper',
        url: window.location.href,
      })
    } else {
      this.shareDialog.nativeElement.style.display = 'block'
    }
  }
}