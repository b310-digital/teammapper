import { OptionParameters } from '@mmp/map/types'

export interface MapOptions extends OptionParameters {
  // single attribute that is not contained in OptionParameters interface
  autoBranchColors: boolean;
  fontMaxSize: number;
  fontMinSize: number;
  fontIncrement: number;
}

export interface Settings {
  general: General;
  mapOptions: MapOptions;
}

interface General {
  language: string;
}
