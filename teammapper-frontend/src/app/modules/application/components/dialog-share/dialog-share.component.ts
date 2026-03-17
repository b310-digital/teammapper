import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  inject,
} from '@angular/core';
import QRCodeStyling from 'qr-code-styling';
import { qrcodeStyling } from './qrcode-settings';
import { API_URL, HttpService } from 'src/app/core/http/http.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { StorageService } from 'src/app/core/services/storage/storage.service';
import { Router } from '@angular/router';
import {
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import {
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'teammapper-dialog-share',
  templateUrl: 'dialog-share.component.html',
  styleUrls: ['dialog-share.component.scss'],
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatSlideToggle,
    FormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatButton,
    MatSuffix,
    MatIcon,
    MatDivider,
    MatDialogActions,
    MatDialogClose,
    TranslatePipe,
  ],
})
export class DialogShareComponent implements OnInit {
  private httpService = inject(HttpService);
  private toastrService = inject(ToastrService);
  private utilsService = inject(UtilsService);
  private storageService = inject(StorageService);
  private dialogRef = inject<MatDialogRef<DialogShareComponent>>(MatDialogRef);
  private router = inject(Router);

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
    const successMessage =
      await this.utilsService.translate('TOASTS.URL_COPIED');
    this.toastrService.success(successMessage);
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
      const successMessage = await this.utilsService.translate(
        'TOASTS.SUCCESSFULLY_DUPLICATED'
      );

      await this.storageService.set(newMap.map.uuid, {
        adminId: newMap.adminId,
        modificationSecret: newMap.modificationSecret,
        ttl: newMap.map.deletedAt,
        rootName: newMap.map.data[0].name,
      });

      this.dialogRef.close();

      window.location.assign(
        `/map/${newMap.map.uuid}?toastMessage=${successMessage}#${newMap.modificationSecret}`
      );
    }
  }

  downloadQrCode() {
    this.qrCode.download();
  }

  getLink() {
    return this.showEditableLink ? this.editorLink : this.viewerLink;
  }

  isShareable(): boolean {
    return !!(navigator as Navigator & { share?: unknown })?.share;
  }

  setShowEditableLink(value: boolean) {
    this.showEditableLink = value;
    this.appendQrCode();
  }

  async share() {
    const nav = navigator as Navigator & {
      share?: (data: { title: string; url: string }) => Promise<void>;
    };
    if (nav?.share) {
      await nav.share({
        title: 'TeamMapper',
        url: this.getLink(),
      });
    } else {
      this.shareDialog.nativeElement.style.display = 'block';
    }
  }
}
