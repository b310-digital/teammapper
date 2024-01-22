export type IPictogramResponse = {
  schematic: boolean;
  sex: boolean;
  violence: boolean;
  aac: boolean;
  aacColor: boolean;
  skin: boolean;
  hair: boolean;
  downloads: number;
  categories: string[];
  synsets: string[];
  tags: string[];
  _id: number;
  keywords: {
    keyword: string;
    type: number;
    plural: string;
    hasLocation: boolean;
  }[];
  created: Date;
  lastUpdated: Date;
};
