import { matchingCards } from './settings-search';

const english: Record<string, string> = {
  'PAGES.SETTINGS.APPEARANCE': 'Appearance',
  'PAGES.SETTINGS.DARK_MODE': 'Dark mode',
  'GENERAL.LANGUAGE': 'Language',
  'PAGES.SETTINGS.PROFILE': 'Profile',
  'PAGES.SETTINGS.DISPLAY_NAME': 'Display name',
  'PAGES.SETTINGS.EDITOR': 'Editor',
  'PAGES.SETTINGS.CENTER_ON_RESIZING': 'Center on resizing',
  'PAGES.SETTINGS.SHOW_LINKTEXT': 'Show linktext',
  'PAGES.SETTINGS.AUTO_BRANCH_COLORS': 'Automatic branch colors',
  'PAGES.SETTINGS.BRANCH_STYLE': 'Branch style',
  'PAGES.SETTINGS.NEW_NODES': 'New nodes',
  'PAGES.SETTINGS.ROOT_NODE_NAME': 'Root node name',
  'PAGES.SETTINGS.NODE_NAME': 'Node name',
  'PAGES.SETTINGS.FONT_SIZES': 'Font sizes',
  'PAGES.SETTINGS.FONT_MIN_SIZE': 'Minimal font size',
  'PAGES.SETTINGS.FONT_MAX_SIZE': 'Maximal font size',
  'PAGES.SETTINGS.FONT_INCREMENT': 'Font size step',
  'PAGES.SETTINGS.DELETION': 'Deletion',
  'PAGES.SETTINGS.DELETE': 'Delete mindmap',
};

const translate = (key: string): string => english[key] ?? key;

describe('matchingCards', () => {
  it('shows every card for an empty query', () => {
    expect([...matchingCards('', translate)]).toEqual([
      'appearance',
      'profile',
      'editor',
      'newNodes',
      'fonts',
      'deletion',
    ]);
  });

  it('shows every card for a query of spaces', () => {
    expect(matchingCards('   ', translate).size).toBe(6);
  });

  it('finds a card by its title', () => {
    expect([...matchingCards('Profile', translate)]).toEqual(['profile']);
  });

  it('finds a card by the name of a setting in it', () => {
    expect([...matchingCards('dark', translate)]).toEqual(['appearance']);
  });

  it('ignores case and surrounding spaces', () => {
    expect([...matchingCards('  FONT ', translate)]).toEqual(['fonts']);
  });

  it('finds every card whose settings match', () => {
    expect([...matchingCards('branch', translate)]).toEqual(['editor']);
    expect([...matchingCards('node', translate)]).toEqual(['newNodes']);
  });

  it('searches the texts of the current language', () => {
    const german = (key: string) =>
      key === 'PAGES.SETTINGS.DARK_MODE' ? 'Dunkler Modus' : translate(key);

    expect([...matchingCards('dunkler', german)]).toEqual(['appearance']);
  });

  it('finds no card for a query nothing matches', () => {
    expect(matchingCards('zebra', translate).size).toBe(0);
  });
});
