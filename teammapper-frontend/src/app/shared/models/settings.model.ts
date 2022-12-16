import { OptionParameters } from '@mmp/map/types'

// Options for the service
// Mmp itself only takes the options parameters. The service can be sugered with additonal options though.
export interface MmpOptions extends OptionParameters {
  // single attribute that is not contained in OptionParameters interface
  autoBranchColors: boolean;
  fontMaxSize: number;
  fontMinSize: number;
  fontIncrement: number;
}

export interface Settings {
  general: General;
  mapOptions: MmpOptions;
}

interface General {
  language: string;
}
