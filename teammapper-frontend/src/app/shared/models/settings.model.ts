import { OptionParameters } from '@mmp/map/types';
import {
  SystemSettingsInfo,
  SystemSettingsUrls,
  SystemFeatureFlags,
  UserGeneralSettings,
  SystemSettings,
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

export interface UserSettings {
  general: UserGeneralSettings;
  mapOptions: MmpOptions;
}

export type Info = SystemSettingsInfo;
export type Urls = SystemSettingsUrls;
export type FeatureFlags = SystemFeatureFlags;
export type General = UserGeneralSettings;

export type {
  SystemSettings,
  SystemSettingsInfo,
  SystemSettingsUrls,
  SystemFeatureFlags,
  UserGeneralSettings,
};
