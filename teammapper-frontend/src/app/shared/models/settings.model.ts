import { OptionParameters } from '@mmp/map/types'

export interface Settings {
  general: General;
  mapOptions: OptionParameters;
}

interface General {
  language: string;
}
