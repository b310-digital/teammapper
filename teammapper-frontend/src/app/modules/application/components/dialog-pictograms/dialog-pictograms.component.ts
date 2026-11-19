import {
  Component,
  EventEmitter,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Pictogram } from '@teammapper/shared';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import {
  Breakpoints,
  BreakpointObserver,
  BreakpointState,
} from '@angular/cdk/layout';
import { map } from 'rxjs/operators';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
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
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from 'src/app/core/services/utils/utils.service';

@Component({
  selector: 'teammapper-dialog-pictograms',
  templateUrl: 'dialog-pictograms.component.html',
  styleUrls: ['./dialog-pictograms.component.scss'],
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
export class DialogPictogramsComponent {
  private pictoService = inject(PictogramService);
  private breakpointObserver = inject(BreakpointObserver);
  private mmpService = inject(MmpService);
  private toastService = inject(ToastrService);
  private utilsService = inject(UtilsService);
  private previewErrorShown = false;

  public pictos = signal<Pictogram[]>([]);
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
    this.previewErrorShown = false;
    this.pictoService.getPictos(this.searchTerm).subscribe({
      next: pictos => this.pictos.set(pictos),
      error: () => {
        this.pictos.set([]);
        void this.showPictogramsError();
      },
    });
  }

  async getImageFileOfId(id: number) {
    this.pictoService.getPictoImage(id).subscribe({
      next: async img => {
        // No resize: it would turn the transparent background black.
        await this.mmpService.addNodeImage(img);
        this.onPictogramAdd.emit();
      },
      error: () => void this.showPictogramsError(),
    });
  }

  // Many previews can fail together, so one search shows one toast.
  async onPreviewError(): Promise<void> {
    if (this.previewErrorShown) return;
    this.previewErrorShown = true;
    await this.showPictogramsError();
  }

  private async showPictogramsError(): Promise<void> {
    this.toastService.error(
      await this.utilsService.translate('TOASTS.ERRORS.PICTOGRAMS_ERROR')
    );
  }

  getImageUrlOfId(id: number): string {
    return this.pictoService.getPictoImageUrl(id);
  }
}
