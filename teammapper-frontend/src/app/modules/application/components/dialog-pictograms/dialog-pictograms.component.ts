import {
  Component,
  EventEmitter,
  HostListener,
  inject,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { IPictogramResponse } from 'src/app/core/services/pictograms/picto-types';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import {
  Breakpoints,
  BreakpointObserver,
  BreakpointState,
} from '@angular/cdk/layout';
import { map } from 'rxjs/operators';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import {
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { NgIf, AsyncPipe } from '@angular/common';
import { MatGridList, MatGridTile } from '@angular/material/grid-list';
import { MatDivider } from '@angular/material/divider';
import { TranslatePipe } from '@ngx-translate/core';

import type {
  OerItem,
  OerSearchResultEvent,
  OerCardClickEvent,
} from '@edufeed-org/oer-finder-plugin';
// Import the OER Finder Plugin to register all web components
import '@edufeed-org/oer-finder-plugin';

@Component({
  selector: 'teammapper-dialog-pictograms',
  templateUrl: 'dialog-pictograms.component.html',
  styleUrls: ['./dialog-pictograms.component.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    MatButton,
    MatSuffix,
    MatIcon,
    NgIf,
    MatGridList,
    MatGridTile,
    MatDivider,
    MatDialogActions,
    MatDialogClose,
    AsyncPipe,
    TranslatePipe,
  ],
})
export class DialogPictogramsComponent {
  private pictoService = inject(PictogramService);
  private breakpointObserver = inject(BreakpointObserver);
  private mmpService = inject(MmpService);
  private utilsService = inject(UtilsService);

  @ViewChild('listElement', { static: false }) listElement!: ElementRef;

  public oers: OerItem[] = [];
  public loading = true;
  public pictos: IPictogramResponse[];
  public onPictogramAdd = new EventEmitter();
  public searchTerm = '';
  public cardLayout = this.breakpointObserver
    .observe([Breakpoints.WebLandscape, Breakpoints.TabletLandscape])
    .pipe(
      map((state: BreakpointState) => {
        if (state.breakpoints[Breakpoints.TabletLandscape]) {
          return {
            columns: 2,
            miniCard: { cols: 1, rows: 1 },
          };
        }

        if (state.breakpoints[Breakpoints.WebLandscape]) {
          return {
            columns: 4,
            miniCard: { cols: 1, rows: 1 },
          };
        }

        return {
          columns: 1,
          miniCard: { cols: 1, rows: 1 },
        };
      })
    );

  @HostListener('document:keydown.enter')
  async search() {
    this.pictoService.getPictos(this.searchTerm).subscribe(pictos => {
      this.pictos = pictos;
    });
  }

  async onCardClick(event: Event) {
    const customEvent = event as CustomEvent<OerCardClickEvent>;
    const oer = customEvent.detail.oer;
    const url = oer?.img_proxy?.small;
    const blob = url ? await (await fetch(url)).blob() : null;
    if (blob) {
      this.mmpService.addNodeImage(await this.utilsService.blobToBase64(blob));
      this.onPictogramAdd.emit();
    } else {
      alert(`OER: ${oer.amb_metadata?.name || 'Unknown'}\nNo URL available`);
    }
  }

  onSearchResults(event: Event) {
    const customEvent = event as CustomEvent<OerSearchResultEvent>;
    const { data, meta } = customEvent.detail;

    const listEl = this.listElement.nativeElement;
    listEl.oers = data;
  }

  onSearchError(event: Event) {
    const customEvent = event as CustomEvent<{ error: string }>;
    const listEl = this.listElement.nativeElement;
    listEl.oers = [];
    listEl.loading = false;
    listEl.error = customEvent.detail.error;
    listEl.showPagination = false;
    listEl.metadata = null;
  }

  onSearchCleared(_event: Event) {
    const listEl = this.listElement.nativeElement;
    listEl.oers = [];
    listEl.loading = false;
    listEl.error = null;
    listEl.showPagination = false;
    listEl.metadata = null;
  }

  async getImageFileOfId(id: number) {
    this.pictoService.getPictoImage(id).subscribe(async img => {
      this.mmpService.addNodeImage(await this.utilsService.blobToBase64(img));
      this.onPictogramAdd.emit();
    });
  }

  getImageUrlOfId(id: number): string {
    return this.pictoService.getPictoImageUrl(id);
  }
}
