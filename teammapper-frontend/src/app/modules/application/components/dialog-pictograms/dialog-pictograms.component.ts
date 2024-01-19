import { Component } from '@angular/core';
import { IPictogramResponse } from 'src/app/core/services/pictograms/picto-types';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';
import { Breakpoints, BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';

@Component({
  selector: 'teammapper-dialog-pictograms',
  templateUrl: 'dialog-pictograms.component.html',
  styleUrls: ['./dialog-pictograms.component.scss']
})
export class DialogPictogramsComponent {
  public pictos: IPictogramResponse[] 
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

  constructor(private pictoService: PictogramService, private breakpointObserver: BreakpointObserver) {}

  async search() {
    this.pictoService.getPictos('Haus').subscribe(pictos => {
      this.pictos = pictos
    });
  }

  getImageUrlOfId(id: number): string {
    return this.pictoService.getPictoImageUrl(id)
  }
}
