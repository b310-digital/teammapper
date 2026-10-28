import {
  IconDefinition,
  faFileExport,
  faImage,
  faQrcode,
  faServer,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';

/** One product feature from `PAGES.ABOUT.INTRODUCTION.APPLICATION_PROPERTIES`. */
export interface AboutFeature {
  key: string;
  icon: IconDefinition;
  color: string;
}

/** One card from the mind map section `PAGES.ABOUT.SECTIONS.0.CARDS`. */
export interface AboutCard {
  titleKey: string;
  contentKey: string;
  image: string;
}

const propertyKey = (index: number): string =>
  `PAGES.ABOUT.INTRODUCTION.APPLICATION_PROPERTIES.${index}`;

const cardKey = (index: number, field: string): string =>
  `PAGES.ABOUT.SECTIONS.0.CARDS.${index}.${field}`;

/** Features in translation order, each with the color of its branch. */
export const ABOUT_FEATURES: AboutFeature[] = [
  { key: propertyKey(0), icon: faUsers, color: '#7cb342' },
  { key: propertyKey(1), icon: faQrcode, color: '#f9a825' },
  { key: propertyKey(2), icon: faImage, color: '#7986cb' },
  { key: propertyKey(3), icon: faFileExport, color: '#26a69a' },
  { key: propertyKey(4), icon: faServer, color: '#ef6c57' },
];

export const ABOUT_CARDS: AboutCard[] = [
  {
    titleKey: cardKey(0, 'TITLE'),
    contentKey: cardKey(0, 'CONTENT'),
    image: './assets/images/solar-system.png',
  },
  {
    titleKey: cardKey(1, 'TITLE'),
    contentKey: cardKey(1, 'CONTENT'),
    image: './assets/images/radial-tree.png',
  },
  {
    titleKey: cardKey(2, 'TITLE'),
    contentKey: cardKey(2, 'CONTENT'),
    image: './assets/images/business-plan.png',
  },
];
