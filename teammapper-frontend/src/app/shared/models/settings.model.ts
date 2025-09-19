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
  info: Info;
  general: General;
  mapOptions: MmpOptions;
  urls: Urls;
  featureFlags: FeatureFlags;
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
}
