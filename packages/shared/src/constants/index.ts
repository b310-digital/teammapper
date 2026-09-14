export const VALID_LANGUAGES = [
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'nl',
  'pt',
  'pt-br',
  'ru',
  'zh',
  'zh-cn',
  'zh-tw',
] as const;

export type ValidLanguage = (typeof VALID_LANGUAGES)[number];

export const MAX_NODE_NAME_LENGTH = 512;
export const MAX_IMAGE_SRC_LENGTH = 200_000;
export const MAX_LINK_HREF_LENGTH = 2048;
export const MAX_FONT_STYLE_LENGTH = 20;
export const MAX_FONT_WEIGHT_LENGTH = 20;
