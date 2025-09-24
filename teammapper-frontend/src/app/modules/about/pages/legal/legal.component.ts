import { Component } from '@angular/core';
import { FooterComponent } from '../../components/footer/footer.component';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'teammapper-legal',
  templateUrl: './legal.component.html',
  styleUrls: ['./legal.component.scss'],
  imports: [HeaderComponent, FooterComponent],
})
export class LegalComponent {}
