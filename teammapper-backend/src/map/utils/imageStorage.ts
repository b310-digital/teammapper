import type { MmpImage } from '../entities/mmpImage.entity'
import type { MmpNode } from '../entities/mmpNode.entity'

/** Inline data URLs occupy UTF-8 bytes, including their base64 overhead. */
export function totalInlineImageBytes(
  nodes: readonly Pick<MmpNode, 'imageSrc'>[]
): number {
  return nodes.reduce(
    (total, node) =>
      total +
      (node.imageSrc?.startsWith('data:')
        ? Buffer.byteLength(node.imageSrc, 'utf8')
        : 0),
    0
  )
}

/** Image metadata records the byte size without loading the binary data. */
export function totalStoredImageBytes(
  images: readonly Pick<MmpImage, 'size'>[]
): number {
  return images.reduce((total, image) => total + image.size, 0)
}
