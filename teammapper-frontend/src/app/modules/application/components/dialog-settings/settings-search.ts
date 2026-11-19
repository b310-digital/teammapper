/** A card of the settings tab. */
export type SettingsCard =
  'appearance' | 'profile' | 'editor' | 'newNodes' | 'fonts' | 'deletion';

/** The cards of the user settings group, in the order the tab shows them. */
export const USER_SETTINGS_CARDS: readonly SettingsCard[] = [
  'appearance',
  'profile',
  'editor',
  'newNodes',
];

/** The cards of the map settings group, below the user settings. */
export const MAP_SETTINGS_CARDS: readonly SettingsCard[] = [
  'fonts',
  'deletion',
];

const SETTINGS_CARDS = [...USER_SETTINGS_CARDS, ...MAP_SETTINGS_CARDS];

/**
 * The texts a search looks through for each card, as translation keys: the
 * card title first, then the names of the settings on the card.
 */
const SEARCHABLE_TEXTS: Record<SettingsCard, readonly string[]> = {
  appearance: [
    'PAGES.SETTINGS.APPEARANCE',
    'PAGES.SETTINGS.DARK_MODE',
    'GENERAL.LANGUAGE',
  ],
  profile: ['PAGES.SETTINGS.PROFILE', 'PAGES.SETTINGS.DISPLAY_NAME'],
  editor: [
    'PAGES.SETTINGS.EDITOR',
    'PAGES.SETTINGS.CENTER_ON_RESIZING',
    'PAGES.SETTINGS.SHOW_LINKTEXT',
    'PAGES.SETTINGS.AUTO_BRANCH_COLORS',
    'PAGES.SETTINGS.BRANCH_STYLE',
  ],
  newNodes: [
    'PAGES.SETTINGS.NEW_NODES',
    'PAGES.SETTINGS.ROOT_NODE_NAME',
    'PAGES.SETTINGS.NODE_NAME',
  ],
  fonts: [
    'PAGES.SETTINGS.FONT_SIZES',
    'PAGES.SETTINGS.FONT_MIN_SIZE',
    'PAGES.SETTINGS.FONT_MAX_SIZE',
    'PAGES.SETTINGS.FONT_INCREMENT',
  ],
  deletion: ['PAGES.SETTINGS.DELETION', 'PAGES.SETTINGS.DELETE'],
};

/**
 * The cards whose title or setting names contain the query, in the language
 * the user reads. The search ignores case and surrounding spaces. An empty
 * query matches every card.
 */
export function matchingCards(
  query: string,
  translate: (key: string) => string
): ReadonlySet<SettingsCard> {
  const needle = query.trim().toLocaleLowerCase();

  return new Set(
    SETTINGS_CARDS.filter(card =>
      SEARCHABLE_TEXTS[card].some(key =>
        translate(key).toLocaleLowerCase().includes(needle)
      )
    )
  );
}
