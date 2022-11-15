import { OptionParameters } from '@mmp/map/types'

export interface MmpOptions extends OptionParameters {
  // single attribute that is not contained in OptionParameters interface
  autoBranchColors: boolean;
}

export interface Settings {
  general: General;
  mapOptions: MmpOptions;
}

interface General {
  language: string;
}
