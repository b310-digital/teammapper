import { DEFAULT_SETTINGS } from './defaultSettings';

describe('DEFAULT_SETTINGS', () => {
  it('turns pictograms and sharing on and ai and arrows off', () => {
    expect(DEFAULT_SETTINGS.systemSettings.featureFlags).toEqual({
      pictograms: true,
      ai: false,
      arrows: false,
      sharing: true,
    });
  });

  it('points the pictogram urls at ARASAAC and leaves the legal links unset', () => {
    expect(DEFAULT_SETTINGS.systemSettings.urls).toEqual({
      pictogramApiUrl: 'https://api.arasaac.org/v1/pictograms',
      pictogramStaticUrl: 'https://static.arasaac.org/pictograms',
      imprintUrl: null,
      privacyUrl: null,
    });
  });

  it('names the app TeamMapper with an empty version and no ai model', () => {
    expect(DEFAULT_SETTINGS.systemSettings.info).toEqual({
      name: 'TeamMapper',
      version: '',
      aiModel: null,
    });
  });

  it('holds the general user settings', () => {
    expect(DEFAULT_SETTINGS.userSettings.general).toEqual({
      language: 'en',
      darkMode: false,
      displayName: '',
    });
  });

  it('holds the map option defaults', () => {
    const { defaultNode, rootNode, ...options } =
      DEFAULT_SETTINGS.userSettings.mapOptions;

    expect(options).toEqual({
      centerOnResize: false,
      autoBranchColors: true,
      showLinktext: false,
      branchStyle: 'tapered',
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
    });
    expect(defaultNode).toBeDefined();
    expect(rootNode).toBeDefined();
  });

  it('holds the default node styling', () => {
    expect(DEFAULT_SETTINGS.userSettings.mapOptions.defaultNode).toEqual({
      name: '',
      link: { href: '' },
      image: { src: '', size: 60 },
      colors: { name: '#666666', background: '#f5f5f5', branch: '#546e7a' },
      font: { size: 22, style: 'normal', weight: 'normal' },
    });
  });

  it('holds the root node styling', () => {
    expect(DEFAULT_SETTINGS.userSettings.mapOptions.rootNode).toEqual({
      name: 'Root node',
      link: { href: '' },
      image: { src: '', size: 70 },
      colors: { name: '#666666', background: '#f5f5f5' },
      font: { size: 26, style: 'normal', weight: 'normal' },
    });
  });
});
