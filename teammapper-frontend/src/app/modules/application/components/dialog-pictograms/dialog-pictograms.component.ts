import { Component, EventEmitter, HostListener } from '@angular/core';
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

@Component({
  selector: 'teammapper-dialog-pictograms',
  templateUrl: 'dialog-pictograms.component.html',
  styleUrls: ['./dialog-pictograms.component.scss'],
})
export class DialogPictogramsComponent {
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

  constructor(
    private pictoService: PictogramService,
    private breakpointObserver: BreakpointObserver,
    private mmpService: MmpService,
    private utilsService: UtilsService
  ) {}

  @HostListener('document:keydown.enter')
  async search() {
    this.pictoService.getPictos(this.searchTerm).subscribe(pictos => {
      this.pictos = pictos;
    });
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
