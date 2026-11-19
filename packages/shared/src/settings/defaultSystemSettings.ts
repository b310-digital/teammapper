import type { SystemSettings } from '../models';

/**
 * System settings that apply when no environment variable overrides them.
 * The version stays empty here: the server and the offline build fill it
 * from the backend package.
 */
export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
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
};
