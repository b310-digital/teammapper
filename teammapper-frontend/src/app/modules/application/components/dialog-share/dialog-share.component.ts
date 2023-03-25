import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import QRCodeStyling from 'qr-code-styling';
import { qrcodeStyling } from './qrcode-settings';

@Component({
  selector: 'teammapper-dialog-share',
  templateUrl: 'dialog-share.component.html',
  styleUrls: ['dialog-share.component.scss'],
})
export class DialogShareComponent implements OnInit {
  @ViewChild('qrcodecanvas', { static: true })
  qrCodeCanvas: ElementRef<HTMLCanvasElement>;
  @ViewChild('sharedialog', { static: true })
  shareDialog: ElementRef<HTMLElement>;
  @ViewChild('inputlink', { static: true })
  inputLink: ElementRef<HTMLInputElement>;

  public showEditableLink = true;
  private editorLink: string = window.location.href;
  private viewerLink: string =
    window.location.protocol +
    '//' +
    window.location.host +
    window.location.pathname +
    window.location.search;
  private qrCode: QRCodeStyling;

  ngOnInit() {
    this.appendQrCode();
  }

  areLinksEqual() {
    return this.editorLink === this.viewerLink;
  }

  appendQrCode() {
    const size: number = window.innerWidth > 400 ? 300 : 200;

    this.qrCode = new QRCodeStyling({
      ...qrcodeStyling,
      width: size,
      height: size,
      data: this.getLink(),
    });
    this.qrCodeCanvas.nativeElement.innerHTML = '';
    this.qrCode.append(this.qrCodeCanvas.nativeElement);
  }

  copy() {
    this.inputLink.nativeElement.select();
    navigator.clipboard.writeText(this.getLink());
  }

  downloadQrCode() {
    this.qrCode.download();
  }

  getLink() {
    return this.showEditableLink ? this.editorLink : this.viewerLink;
  }

  isShareable() {
    return !!(window.navigator as any)?.share;
  }

  setShowEditableLink(value: boolean) {
    this.showEditableLink = value;
    this.appendQrCode();
  }

  async share() {
    if ((window.navigator as any)?.share) {
      await (window.navigator as any)?.share({
        title: 'TeamMapper',
        url: this.getLink(),
      });
    } else {
      this.shareDialog.nativeElement.style.display = 'block';
    }
  }
}
