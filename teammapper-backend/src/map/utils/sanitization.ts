import sanitizeHtml from 'sanitize-html'
import {
  isImageDataUrl,
  isImageReference,
  isSafeLinkHref,
} from '@teammapper/shared'
import { MmpNode } from '../entities/mmpNode.entity'

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const ALLOWED_FONT_STYLES = ['normal', 'italic']
const ALLOWED_FONT_WEIGHTS = ['normal', 'bold']

/** Strip all HTML tags from a node name, returning plain text only. */
const sanitizeName = (name: string | undefined | null): string => {
  if (!name) return ''
  return sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} })
}

/** Validate imageSrc is an image reference or a safe raster base64 data URI. Returns empty string for invalid values. */
const sanitizeImageSrc = (src: string | undefined | null): string => {
  if (!src) return ''
  return isImageReference(src) || isImageDataUrl(src) ? src : ''
}

/** Validate linkHref uses only http or https protocol. Returns empty string for invalid values. */
const sanitizeLinkHref = (href: string | undefined | null): string =>
  href && isSafeLinkHref(href) ? href : ''

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
}
