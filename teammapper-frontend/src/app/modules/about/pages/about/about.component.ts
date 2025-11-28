import { Component } from '@angular/core';
import {
  faBrain,
  faChartLine,
  faCheck,
  faCogs,
  faHeart,
  faRocket,
} from '@fortawesome/free-solid-svg-icons';
import { HeaderComponent } from '../../components/header/header.component';
import { JumbotronComponent } from '../../components/jumbotron/jumbotron.component';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import {
  MatCardAvatar,
  MatCard,
  MatCardHeader,
  MatCardTitle,
  MatCardImage,
  MatCardContent,
} from '@angular/material/card';
import { FooterComponent } from '../../components/footer/footer.component';
import { TranslatePipe } from '@ngx-translate/core';
import { MindmapsOverview } from 'src/app/shared/components/mindmaps-overview/mindmaps-overview.component';

@Component({
  selector: 'teammapper-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
  imports: [
    MindmapsOverview,
    HeaderComponent,
    JumbotronComponent,
    FaIconComponent,
    MatCardAvatar,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardImage,
    MatCardContent,
    FooterComponent,
    TranslatePipe,
  ],
})
export class AboutComponent {
  public faBrain = faBrain;
  public faRocket = faRocket;
  public faHeart = faHeart;
  public faChartLine = faChartLine;
  public faCogs = faCogs;
  public faCheck = faCheck;
}
