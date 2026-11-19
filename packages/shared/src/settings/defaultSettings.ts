import type { Settings } from '../models';

/**
 * Settings that apply when no environment variable overrides them. The
 * version stays empty here: the server and the offline build fill it from
 * the backend package.
 */
export const DEFAULT_SETTINGS: Settings = {
  systemSettings: {
    info: { name: 'TeamMapper', version: '', aiModel: null },
    urls: {
      pictogramApiUrl: 'https://api.arasaac.org/v1/pictograms',
      pictogramStaticUrl: 'https://static.arasaac.org/pictograms',
      imprintUrl: null,
      privacyUrl: null,
    },
    featureFlags: {
      pictograms: true,
      ai: false,
      arrows: false,
      sharing: true,
    },
  },
  userSettings: {
    general: { language: 'en', darkMode: false, displayName: '' },
    mapOptions: {
      centerOnResize: false,
      autoBranchColors: true,
      showLinktext: false,
      branchStyle: 'tapered',
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
      defaultNode: {
        name: '',
        link: { href: '' },
        image: { src: '', size: 60 },
        colors: { name: '#666666', background: '#f5f5f5', branch: '#546e7a' },
        font: { size: 22, style: 'normal', weight: 'normal' },
      },
      rootNode: {
        name: 'Root node',
        link: { href: '' },
        image: { src: '', size: 70 },
        colors: { name: '#666666', background: '#f5f5f5' },
        font: { size: 26, style: 'normal', weight: 'normal' },
      },
    },
  },
};
