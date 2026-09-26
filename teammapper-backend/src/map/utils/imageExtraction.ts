import { v4 as uuidv4 } from 'uuid'
import {
  IMAGE_DATA_URL_REGEX,
  ImageReference,
  isRasterImageMimeType,
  toImageReference,
} from '@teammapper/shared'
import { MmpNode } from '../entities/mmpNode.entity'
import { StoredImage } from '../services/images.service'
import { matchesRasterSignature } from './rasterImageValidator'

/** The node columns the extraction reads. */
export type NodeImageSrc = Pick<MmpNode, 'id' | 'imageSrc'>

/** A decoded data URL and the image id the job stores it under. */
export interface ExtractedImage extends StoredImage {
  id: string
}

/** The image reference that replaces the data URL of one node. */
export interface NodeImageReplacement {
  nodeId: string
  dataUrl: string
  reference: ImageReference
}

/** The images to store and the node changes that point at them. */
export interface ImageDataUrlExtraction {
  images: ExtractedImage[]
  replacements: NodeImageReplacement[]
  /** Nodes whose data URL does not decode to an image of its declared type. */
  failedNodeIds: string[]
}

/** Base64 with at most two padding characters, and those only at the end. */
const BASE64_PAYLOAD_REGEX = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * Decodes a base64 payload, padded or not. Returns null for a `=` before the
 * end, because Buffer.from may decode such a payload to fewer bytes, and
 * truncated bytes can still pass the signature check.
 */
const decodeBase64 = (payload: string): Buffer | null =>
  BASE64_PAYLOAD_REGEX.test(payload) ? Buffer.from(payload, 'base64') : null

/**
 * Returns the type and bytes of a raster base64 data URL, or null when the
 * value is not such a data URL or its bytes do not match the declared type.
 * The image endpoint sends the stored type as Content-Type, so the decoder
 * checks the magic bytes, as the upload validator does.
 */
export const decodeImageDataUrl = (src: string): StoredImage | null => {
  const match = IMAGE_DATA_URL_REGEX.exec(src)
  if (!match) return null
  const mimetype = `image/${match[1]}`
  if (!isRasterImageMimeType(mimetype)) return null
  const data = decodeBase64(src.slice(src.indexOf(',') + 1))
  if (!data || !matchesRasterSignature(mimetype, data)) return null
  return { mimetype, data }
}

/**
 * Plans the extraction of one map and reads or writes nothing. The planner
 * decodes each distinct data URL once, generates one image id for it, and
 * pairs every node holding it with the matching image reference. A node
 * without a data URL gets no replacement, and a node whose data URL fails to
 * decode goes into `failedNodeIds`.
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

/** Decodes one data URL and generates an image id only when it decodes. */
const extract = (
  src: string,
  generateId: () => string
): ExtractedImage | null => {
  const decoded = decodeImageDataUrl(src)
  return decoded ? { ...decoded, id: generateId() } : null
}
