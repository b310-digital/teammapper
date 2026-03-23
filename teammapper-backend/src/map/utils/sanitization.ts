import sanitizeHtml from 'sanitize-html'
import { MmpNode } from '../entities/mmpNode.entity'

const ALLOWED_IMAGE_MIMES = ['jpeg', 'png', 'gif', 'webp']
const IMAGE_DATA_URI_REGEX =
  /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const ALLOWED_FONT_STYLES = ['normal', 'italic']
const ALLOWED_FONT_WEIGHTS = ['normal', 'bold']
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:']

/** Strip all HTML tags from a node name, returning plain text only. */
const sanitizeName = (name: string | undefined | null): string => {
  if (!name) return ''
  return sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} })
}

/** Validate imageSrc is a safe raster base64 data URI. Returns empty string for invalid values. */
const sanitizeImageSrc = (src: string | undefined | null): string => {
  if (!src) return ''
  return IMAGE_DATA_URI_REGEX.test(src) ? src : ''
}

/** Validate linkHref uses only http or https protocol. Returns empty string for invalid values. */
const sanitizeLinkHref = (href: string | undefined | null): string => {
  if (!href) return ''
  try {
    const url = new URL(href)
    return ALLOWED_LINK_PROTOCOLS.includes(url.protocol) ? href : ''
  } catch {
    return ''
  }
}

/** Validate a hex color value (#rrggbb or #rrggbbaa). Returns empty string for invalid values. */
const sanitizeColor = (color: string | undefined | null): string => {
  if (!color) return ''
  return HEX_COLOR_REGEX.test(color.trim()) ? color.trim() : ''
}

/** Validate font style against allowlist. Returns 'normal' for invalid values. */
const sanitizeFontStyle = (style: string | undefined | null): string => {
  if (!style) return 'normal'
  return ALLOWED_FONT_STYLES.includes(style) ? style : 'normal'
}

/** Validate font weight against allowlist. Returns 'normal' for invalid values. */
const sanitizeFontWeight = (weight: string | undefined | null): string => {
  if (!weight) return 'normal'
  return ALLOWED_FONT_WEIGHTS.includes(weight) ? weight : 'normal'
}

/** Sanitize all user-controlled string fields on a Partial<MmpNode>. Only touches fields that are present. */
const sanitizeNodeFields = (node: Partial<MmpNode>): Partial<MmpNode> => ({
  ...node,
  ...(node.name !== undefined && { name: sanitizeName(node.name) }),
  ...(node.imageSrc !== undefined && {
    imageSrc: sanitizeImageSrc(node.imageSrc),
  }),
  ...(node.linkHref !== undefined && {
    linkHref: sanitizeLinkHref(node.linkHref),
  }),
  ...(node.colorsName !== undefined && {
    colorsName: sanitizeColor(node.colorsName),
  }),
  ...(node.colorsBackground !== undefined && {
    colorsBackground: sanitizeColor(node.colorsBackground),
  }),
  ...(node.colorsBranch !== undefined && {
    colorsBranch: sanitizeColor(node.colorsBranch),
  }),
  ...(node.fontStyle !== undefined && {
    fontStyle: sanitizeFontStyle(node.fontStyle),
  }),
  ...(node.fontWeight !== undefined && {
    fontWeight: sanitizeFontWeight(node.fontWeight),
  }),
})

export {
  sanitizeName,
  sanitizeImageSrc,
  sanitizeLinkHref,
  sanitizeColor,
  sanitizeFontStyle,
  sanitizeFontWeight,
  sanitizeNodeFields,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_LINK_PROTOCOLS,
  ALLOWED_FONT_STYLES,
  ALLOWED_FONT_WEIGHTS,
}
