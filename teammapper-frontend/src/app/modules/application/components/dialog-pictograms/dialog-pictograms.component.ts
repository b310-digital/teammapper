import {
  AfterViewInit,
  Component,
  EventEmitter,
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
import { AsyncPipe } from '@angular/common';
import { MatGridList, MatGridTile } from '@angular/material/grid-list';
import { MatDivider } from '@angular/material/divider';
import { TranslatePipe } from '@ngx-translate/core';

import type {
  OerSearchResultEvent,
  OerCardClickEvent,
  OerSearchElement,
  SourceConfig,
} from '@edufeed-org/oer-finder-plugin';
// Import the OER Finder Plugin to register all web components
import '@edufeed-org/oer-finder-plugin';
import { registerArasaacAdapter } from '@edufeed-org/oer-finder-plugin/adapters';

// Register ARASAAC adapter for direct-client mode (no server proxy)
registerArasaacAdapter();

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
    MatGridList,
    MatGridTile,
    MatDivider,
    MatDialogActions,
    MatDialogClose,
    AsyncPipe,
    TranslatePipe,
  ],
})
export class DialogPictogramsComponent implements AfterViewInit {
  private pictoService = inject(PictogramService);
  private breakpointObserver = inject(BreakpointObserver);
  private mmpService = inject(MmpService);
  private utilsService = inject(UtilsService);

  @ViewChild('searchElement') searchElement!: ElementRef;
  @ViewChild('listElement') listElement!: ElementRef;
  @ViewChild('loadMoreElement') loadMoreElement!: ElementRef;

  public onPictogramAdd = new EventEmitter();
  public pictos: IPictogramResponse[];
  public searchTerm = '';
  public cardLayout = this.breakpointObserver
    .observe([Breakpoints.WebLandscape, Breakpoints.TabletLandscape])
    .pipe(
      map((state: BreakpointState) => {
        if (state.breakpoints[Breakpoints.TabletLandscape]) {
          return { columns: 2, miniCard: { cols: 1, rows: 1 } };
        }
        if (state.breakpoints[Breakpoints.WebLandscape]) {
          return { columns: 4, miniCard: { cols: 1, rows: 1 } };
        }
        return { columns: 1, miniCard: { cols: 1, rows: 1 } };
      })
    );

  sources: SourceConfig[] = [
    { id: 'arasaac', label: 'ARASAAC', checked: true },
  ];

  ngAfterViewInit(): void {
    const searchEl = this.searchElement.nativeElement as OerSearchElement;
    searchEl.sources = this.sources;
    const stopPropagation = (event: Event) => event.stopPropagation();
    searchEl.addEventListener('keydown', stopPropagation);
    searchEl.addEventListener('keyup', stopPropagation);
    searchEl.addEventListener('keypress', stopPropagation);
  }

  onSearchLoading(): void {
    const listEl = this.listElement.nativeElement;
    const loadMoreEl = this.loadMoreElement.nativeElement;
    listEl.loading = true;
    loadMoreEl.loading = true;
  }

  onSearchResults(event: Event): void {
    const { data, meta } = (event as OerSearchResultEvent).detail;
    const listEl = this.listElement.nativeElement;
    const loadMoreEl = this.loadMoreElement.nativeElement;
    listEl.oers = data;
    listEl.loading = false;
    loadMoreEl.metadata = meta;
    loadMoreEl.loading = false;
  }

  onSearchError(event: Event): void {
    const { error } = (event as CustomEvent<{ error: string }>).detail;
    const listEl = this.listElement.nativeElement;
    const loadMoreEl = this.loadMoreElement.nativeElement;
    listEl.oers = [];
    listEl.error = error;
    listEl.loading = false;
    loadMoreEl.metadata = null;
    loadMoreEl.loading = false;
  }

  onSearchCleared(): void {
    const listEl = this.listElement.nativeElement;
    const loadMoreEl = this.loadMoreElement.nativeElement;
    listEl.oers = [];
    listEl.error = null;
    listEl.loading = false;
    loadMoreEl.metadata = null;
    loadMoreEl.loading = false;
  }

  async onCardClick(event: Event): Promise<void> {
    const { oer } = (event as OerCardClickEvent).detail;
    const url = oer?.extensions?.images?.small;
    const blob = url ? await this.fetchImageBlob(url) : null;
    if (blob) {
      this.mmpService.addNodeImage(await this.utilsService.blobToBase64(blob));
      this.onPictogramAdd.emit();
    } else {
      alert(`OER: ${oer.amb?.name || 'Unknown'}\nNo URL available`);
    }
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

  private async fetchImageBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    return response.blob();
  }
}
