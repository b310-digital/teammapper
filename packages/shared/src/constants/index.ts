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
export const DEFAULT_FONT_MAX_SIZE = 48;
export const DEFAULT_ROOT_FONT_STYLE = 'normal';
export const DEFAULT_ROOT_FONT_WEIGHT = 'normal';

/**
 * HTTP header that carries a map's modification secret. Access logs record the
 * URL and skip this header. The client leaves `Authorization` free for basic
 * auth or an auth proxy in front of TeamMapper. The name is lowercase because
 * Node lowercases incoming header names.
 */
export const MODIFICATION_SECRET_HEADER = 'x-map-modification-secret';

/**
 * WebSocket subprotocol the server selects for the Yjs connection. The browser
 * `WebSocket` constructor sends no custom header, so the client offers the
 * modification secret as a second subprotocol,
 * `<YJS_SECRET_SUBPROTOCOL_PREFIX><secret>`. The server selects
 * `YJS_SUBPROTOCOL` alone, so the handshake response carries no secret.
 * RFC 9110 requires a subprotocol to be a token, and a uuid secret is one.
 */
export const YJS_SUBPROTOCOL = 'teammapper.v1';
export const YJS_SECRET_SUBPROTOCOL_PREFIX = 'teammapper.secret.';
