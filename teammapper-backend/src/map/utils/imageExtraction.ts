import { v4 as uuidv4 } from 'uuid'
import {
  IMAGE_DATA_URL_REGEX,
  ImageReference,
  isRasterImageMimeType,
  RasterImageMimeType,
  toImageReference,
} from '@teammapper/shared'
import { matchesRasterSignature } from './rasterImageValidator'

/** The image column of one node row. */
export interface NodeImageSrc {
  id: string
  imageSrc: string | null
}

/** The type and bytes of one image. */
export interface DecodedImage {
  mimetype: RasterImageMimeType
  data: Buffer
}

/** An inline image moved out of its nodes, under the id it is stored with. */
export interface ExtractedImage extends DecodedImage {
  id: string
  size: number
}

/** The reference that replaces the inline image of one node. */
export interface NodeImageReplacement {
  nodeId: string
  dataUrl: string
  reference: ImageReference
}

export interface ImageDataUrlExtraction {
  images: ExtractedImage[]
  replacements: NodeImageReplacement[]
  /** Nodes whose data URL does not decode to a raster image of its type. */
  failedNodeIds: string[]
}

/**
 * Returns the type and bytes of a raster base64 data URL, or null when the
 * value is no such data URL or its bytes do not match the declared type. The
 * image endpoint sends the stored type as Content-Type, so the bytes decide,
 * as on upload.
 */
export const decodeImageDataUrl = (
  src: string | null | undefined
): DecodedImage | null => {
  if (!src) return null
  const match = IMAGE_DATA_URL_REGEX.exec(src)
  if (!match) return null
  const mimetype = `image/${match[1]}`
  if (!isRasterImageMimeType(mimetype)) return null
  const data = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
  return matchesRasterSignature(mimetype, data) ? { mimetype, data } : null
}

/**
 * Moves every valid inline image of one map's nodes out into an image and
 * replaces it with a reference. Nodes holding the same data URL share one
 * image. A node without a data URL gets no replacement, and a node whose data
 * URL does not decode is listed in `failedNodeIds`.
 */
export const extractImageDataUrls = (
  nodes: NodeImageSrc[],
  generateId: () => string = uuidv4
): ImageDataUrlExtraction => {
  const imagesBySrc = new Map<string, ExtractedImage | null>()
  const imageOf = (src: string): ExtractedImage | null => {
    if (!imagesBySrc.has(src)) imagesBySrc.set(src, extract(src, generateId))
    return imagesBySrc.get(src) ?? null
  }
  const failedNodeIds: string[] = []
  const replacements = nodes.flatMap(({ id, imageSrc }) => {
    if (!imageSrc?.startsWith('data:')) return []
    const image = imageOf(imageSrc)
    if (!image) {
      failedNodeIds.push(id)
      return []
    }
    return [
      { nodeId: id, dataUrl: imageSrc, reference: toImageReference(image.id) },
    ]
  })
  const images = Array.from(imagesBySrc.values()).filter(
    (image): image is ExtractedImage => image !== null
  )
  return { images, replacements, failedNodeIds }
}

/** Decodes one data URL and draws an id for it only when it decodes. */
const extract = (
  src: string,
  generateId: () => string
): ExtractedImage | null => {
  const decoded = decodeImageDataUrl(src)
  return decoded
    ? { ...decoded, id: generateId(), size: decoded.data.length }
    : null
}
