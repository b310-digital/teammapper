import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import QRCodeStyling from 'qr-code-styling';
import { qrcodeStyling } from './qrcode-settings';
import { API_URL, HttpService } from 'src/app/core/http/http.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { ToastrService } from 'ngx-toastr';

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

  constructor(
    private httpService: HttpService,
    private toastrService: ToastrService,
    private utilsService: UtilsService
  ) {}

  ngOnInit() {
    this.appendQrCode();
  }

  areLinksEqual() {
    return this.editorLink === this.viewerLink;
  }

  appendQrCode() {
    const size: number = window.innerWidth > 500 ? 300 : 200;

    this.qrCode = new QRCodeStyling({
      ...qrcodeStyling,
      width: size,
      height: size,
      data: this.getLink(),
    });
    this.qrCodeCanvas.nativeElement.innerHTML = '';
    this.qrCode.append(this.qrCodeCanvas.nativeElement);
  }

  async copy() {
    this.inputLink.nativeElement.select();
    // requires a secure origin (https) to work
    navigator.clipboard.writeText(this.getLink());
    const sucessMessage = await this.utilsService.translate(
      'TOASTS.URL_COPIED'
    );
    this.toastrService.success(sucessMessage);
  }

  async duplicateMindMap() {
    // getCurrentMap from the MmpService doesn't give us the UUID of the map, only a legacy id and the root note ID, so we'll have to use the URL params.
    const id = window.location.pathname.split('/')[2];
    const response = await this.httpService.post(
      API_URL.ROOT,
      '/maps/' + id + '/duplicate'
    );
    if (!response.ok) return null;

    const newMap = await response.json();
    if (newMap && newMap.map.uuid) {
      const sucessMessage = await this.utilsService.translate(
        'TOASTS.SUCCESSFULLY_DUPLICATED'
      );
      this.toastrService.success(sucessMessage);

      // Built in delay to allow users to read the toast (if we redirect immediately the toast gets swallowed up)
      // The reason we're doing a client-side replace and not server-side redirect is to make sure all client-side data is refreshed
      setTimeout(
        () =>
          window.location.replace(
            `/map/${newMap.map.uuid}#${newMap.modificationSecret}`
          ),
        750
      );
    }
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
