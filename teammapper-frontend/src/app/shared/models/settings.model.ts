import { OptionParameters } from '@mmp/map/types';

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

export interface SystemSettings {
  info: Info;
  urls: Urls;
  featureFlags: FeatureFlags;
}

export interface UserSettings {
  general: General;
  mapOptions: MmpOptions;
}

interface General {
  language: string;
}

interface Info {
  name: string;
  version: string;
}

interface Urls {
  pictogramApiUrl: string;
  pictogramStaticUrl: string;
}

interface FeatureFlags {
  pictograms: boolean;
  ai: boolean;
}
