export const SUPPORTED_LANGUAGES = [
  'en',
  'fr',
  'de',
  'it',
  'zh-tw',
  'zh-cn',
  'es',
  'pt-br',
  'ja',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Backwards compatibility alias
export const VALID_LANGUAGES = SUPPORTED_LANGUAGES;
export type ValidLanguage = SupportedLanguage;

export const MAX_NODE_NAME_LENGTH = 512;
export const MAX_IMAGE_SRC_LENGTH = 200_000;
export const MAX_LINK_HREF_LENGTH = 2048;
export const MAX_FONT_STYLE_LENGTH = 20;
export const MAX_FONT_WEIGHT_LENGTH = 20;
export const MAX_MERMAID_DESCRIPTION_LENGTH = 5000;

export const DEFAULT_ROOT_NAME = 'Root node';
export const DEFAULT_ROOT_COLOR_NAME = '#787878';
export const DEFAULT_ROOT_COLOR_BACKGROUND = '#f0f6f5';
export const DEFAULT_ROOT_FONT_SIZE = 20;
export const DEFAULT_ROOT_FONT_STYLE = 'normal';
export const DEFAULT_ROOT_FONT_WEIGHT = 'normal';
