import { OptionParameters } from '@mmp/map/types'

export interface MapOptions extends OptionParameters {
  // single attribute that is not contained in OptionParameters interface
  autoBranchColors: boolean;
}

export interface Settings {
  general: General;
  mapOptions: MapOptions;
}

interface General {
  language: string;
}
