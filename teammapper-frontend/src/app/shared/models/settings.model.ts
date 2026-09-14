import { OptionParameters } from '@mmp/map/types';
import {
  SystemSettingsInfo as Info,
  SystemSettingsUrls as Urls,
  SystemFeatureFlags as FeatureFlags,
  UserGeneralSettings as General,
  SystemSettings as SharedSystemSettings,
} from '@teammapper/shared';

// Options for the service
// Mmp itself only takes the options parameters. The service can be sugered with additonal options though.
export interface MmpOptions extends OptionParameters {
  // single attribute that is not contained in OptionParameters interface
  autoBranchColors: boolean;
  fontMaxSize: number;
  fontMinSize: number;
  fontIncrement: number;
  showLinktext?: boolean;
}

export interface Settings {
  systemSettings: SystemSettings;
  userSettings: UserSettings;
}

export interface SystemSettings extends SharedSystemSettings {
  info: Info;
  urls: Urls;
  featureFlags: FeatureFlags;
}

export interface UserSettings {
  general: General;
  mapOptions: MmpOptions;
}

export type { General, Info, Urls, FeatureFlags };
