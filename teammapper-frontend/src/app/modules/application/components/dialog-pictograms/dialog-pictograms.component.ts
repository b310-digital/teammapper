import { Component } from '@angular/core';
import { IPictogramResponse } from 'src/app/core/services/pictograms/picto-types';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import { Breakpoints, BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';
import { MmpService } from 'src/app/core/services/mmp/mmp.service';

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

  constructor(private pictoService: PictogramService, private breakpointObserver: BreakpointObserver, private mmpService: MmpService) {}

  async search() {
    this.pictoService.getPictos(this.searchTerm).subscribe(pictos => {
      this.pictos = pictos
    });
  }

  async getImageFileOfId(id: number) {
    const image = this.pictoService.getPictoImage(id).subscribe(async img => {
      console.log(URL.createObjectURL(img))
      this.mmpService.addNodeImage(await this.blobToBase64(img));
    });
  }

  getImageUrlOfId(id: number): string {
    return this.pictoService.getPictoImageUrl(id)
  }

  blobToBase64(blob: Blob): Promise<string | ArrayBuffer> {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    return new Promise(resolve => {
      reader.onloadend = () => {
        resolve(reader.result);
      };
    });
  };
}
