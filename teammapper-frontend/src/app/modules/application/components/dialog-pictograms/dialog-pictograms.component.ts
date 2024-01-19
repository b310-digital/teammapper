import { Component } from '@angular/core';
import { IPictogramResponse } from 'src/app/core/services/pictograms/picto-types';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import { Breakpoints, BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';
import { UtilsService } from 'src/app/core/services/utils/utils.service';
import { DialogService } from 'src/app/core/services/dialog/dialog.service';

@Component({
  selector: 'teammapper-dialog-pictograms',
  templateUrl: 'dialog-pictograms.component.html',
  styleUrls: ['./dialog-pictograms.component.scss']
})
export class DialogPictogramsComponent {
  public pictos: IPictogramResponse[] 
  public searchTerm: string = ""
  public cardLayout = this.breakpointObserver
  .observe([Breakpoints.Handset])
  .pipe(
    map(({ matches }) => {
      if (matches) {
        return {
          columns: 1,
          miniCard: { cols: 1, rows: 1 }
        };
      }

      return {
        columns: 4,
        miniCard: { cols: 1, rows: 1 }
      };
    })
  );

  constructor(private pictoService: PictogramService, private breakpointObserver: BreakpointObserver, private mmpService: MmpService, private utilsService: UtilsService, private dialogService: DialogService) {}

  async search() {
    this.pictoService.getPictos(this.searchTerm).subscribe(pictos => {
      this.pictos = pictos
    });
  }

  async getImageFileOfId(id: number) {
    this.pictoService.getPictoImage(id).subscribe(async img => {
      this.mmpService.addNodeImage(await this.utilsService.blobToBase64(img));
      this.dialogService.closePictogramDialog()
    });
  }

  getImageUrlOfId(id: number): string {
    return this.pictoService.getPictoImageUrl(id)
  }
}
