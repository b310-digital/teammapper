import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { TranslatePipe } from '@ngx-translate/core';
import { MindmapsOverview } from 'src/app/shared/components/mindmaps-overview/mindmaps-overview.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { ABOUT_CARDS, ABOUT_FEATURES, AboutFeature } from './about-content';

/** A feature node placed in the hero's 1000 x 500 coordinate space. */
interface PlacedFeature extends AboutFeature {
  x: number;
  y: number;
  path: string;
}

const CENTER = { x: 500, y: 250 };
const NODE_POSITIONS = [
  { x: 180, y: 110 },
  { x: 160, y: 390 },
  { x: 820, y: 80 },
  { x: 860, y: 250 },
  { x: 820, y: 420 },
];

/** Draws a curved branch from the root to (x, y). */
const branchPath = (x: number, y: number): string => {
  const midX = (CENTER.x + x) / 2;
  return `M${CENTER.x},${CENTER.y} C${midX},${CENTER.y} ${midX},${y} ${x},${y}`;
};

/**
 * Start page. The hero draws a mind map: its root creates a new map, and each
 * branch leads to one feature.
 */
@Component({
  selector: 'teammapper-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
  imports: [
    RouterLink,
    FaIconComponent,
    TranslatePipe,
    MindmapsOverview,
    FooterComponent,
  ],
})
export class AboutComponent {
  public readonly cards = ABOUT_CARDS;
  public readonly repositoryUrl = 'https://github.com/b310-digital/teammapper';
  public readonly faGithub = faGithub;
  public readonly faArrowRight = faArrowRight;
  public readonly features: PlacedFeature[] = ABOUT_FEATURES.map(
    (feature, index) => {
      const { x, y } = NODE_POSITIONS[index];
      return { ...feature, x, y, path: branchPath(x, y) };
    }
  );
}
