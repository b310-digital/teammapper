import { Component } from '@angular/core';
import { PictogramService } from 'src/app/core/services/pictograms/pictogram.service';

@Component({
  selector: 'teammapper-dialog-pictograms',
  templateUrl: 'dialog-pictograms.component.html',
})
export class DialogPictogramsComponent {
  constructor(private pictoService: PictogramService) {}

  async search() {
    this.pictoService.getPictos('Haus').subscribe(pictos => {
      console.log(pictos)
  });
  }
}
