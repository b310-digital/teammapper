import {
  dataUrl,
  LARGE_LOGO_URL,
  LOGO_PNG,
  LOGO_URL,
  MISMATCH_URL,
} from '../../../test/imageFixtures'
import { decodeImageDataUrl, extractImageDataUrls } from './imageExtraction'

const SVG_URL = dataUrl('svg+xml', Buffer.from('<svg/>'))

const IMAGE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const IMAGE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/** Returns the given ids in order, one per call. */
const sequentialIds = (...ids: string[]) => {
  let next = 0
  return () => {
    const id = ids[next++]
    if (!id) throw new Error('No id left')
    return id
  }
}

describe('decodeImageDataUrl', () => {
  it('decodes a PNG data URL', () => {
    expect(decodeImageDataUrl(LOGO_URL)).toEqual({
      mimetype: 'image/png',
      data: LOGO_PNG,
    })
  })

  it('decodes a data URL without padding', () => {
    const unpadded = LOGO_URL.replace(/=+$/, '')

    expect(decodeImageDataUrl(unpadded)).toEqual({
      mimetype: 'image/png',
      data: LOGO_PNG,
    })
  })

  it.each([
    ['an image reference', `image:${IMAGE_A}`],
    ['a non-raster type', SVG_URL],
    ['a data URL that is not base64', 'data:image/png,abc'],
    ['a character outside the base64 alphabet', `${LOGO_URL}!`],
    ['bytes that do not match the declared type', MISMATCH_URL],
    [
      'a payload shorter than the signature',
      dataUrl('png', LOGO_PNG.subarray(0, 4)),
    ],
  ])('returns null for %s', (_, src) => {
    expect(decodeImageDataUrl(src)).toBeNull()
  })

  it('returns null for padding in the middle of the payload', () => {
    // The logo, encoded as two separately padded halves.
    const firstHalf = dataUrl('png', LOGO_PNG.subarray(0, 8))
    const secondHalf = LOGO_PNG.subarray(8).toString('base64')

    expect(decodeImageDataUrl(firstHalf + secondHalf)).toBeNull()
  })
})

describe('extractImageDataUrls', () => {
  it('plans one image and one replacement for a data URL', () => {
    const result = extractImageDataUrls(
      [{ id: 'node-1', imageSrc: LOGO_URL }],
      sequentialIds(IMAGE_A)
    )

    expect(result).toEqual({
      images: [{ id: IMAGE_A, mimetype: 'image/png', data: LOGO_PNG }],
      replacements: [
        { nodeId: 'node-1', dataUrl: LOGO_URL, reference: `image:${IMAGE_A}` },
      ],
      failedNodeIds: [],
    })
  })

  it('gives each distinct data URL its own image', () => {
    const result = extractImageDataUrls(
      [
        { id: 'node-1', imageSrc: LOGO_URL },
        { id: 'node-2', imageSrc: LARGE_LOGO_URL },
      ],
      sequentialIds(IMAGE_A, IMAGE_B)
    )

    expect({
      imageIds: result.images.map((image) => image.id),
      replacements: result.replacements,
    }).toEqual({
      imageIds: [IMAGE_A, IMAGE_B],
      replacements: [
        { nodeId: 'node-1', dataUrl: LOGO_URL, reference: `image:${IMAGE_A}` },
        {
          nodeId: 'node-2',
          dataUrl: LARGE_LOGO_URL,
          reference: `image:${IMAGE_B}`,
        },
      ],
    })
  })

  it('plans one image for nodes holding the same data URL', () => {
    const result = extractImageDataUrls(
      [
        { id: 'node-1', imageSrc: LOGO_URL },
        { id: 'node-2', imageSrc: LOGO_URL },
      ],
      sequentialIds(IMAGE_A, IMAGE_B)
    )

    expect({
      imageIds: result.images.map((image) => image.id),
      replacements: result.replacements,
    }).toEqual({
      imageIds: [IMAGE_A],
      replacements: [
        { nodeId: 'node-1', dataUrl: LOGO_URL, reference: `image:${IMAGE_A}` },
        { nodeId: 'node-2', dataUrl: LOGO_URL, reference: `image:${IMAGE_A}` },
      ],
    })
  })

  it('lists only nodes with an invalid data URL as failed', () => {
    const result = extractImageDataUrls([
      { id: 'empty', imageSrc: null },
      { id: 'blank', imageSrc: '' },
      { id: 'reference', imageSrc: `image:${IMAGE_B}` },
      { id: 'svg', imageSrc: SVG_URL },
      { id: 'mismatch', imageSrc: MISMATCH_URL },
    ])

    expect(result).toEqual({
      images: [],
      replacements: [],
      failedNodeIds: ['svg', 'mismatch'],
    })
  })

  it('replaces the valid data URLs and generates no id for invalid ones', () => {
    const generateId = jest.fn(sequentialIds(IMAGE_A))

    const result = extractImageDataUrls(
      [
        { id: 'first', imageSrc: MISMATCH_URL },
        { id: 'valid', imageSrc: LOGO_URL },
        { id: 'second', imageSrc: MISMATCH_URL },
      ],
      generateId
    )

    expect({
      replacements: result.replacements,
      failedNodeIds: result.failedNodeIds,
      generatedIds: generateId.mock.calls.length,
    }).toEqual({
      replacements: [
        { nodeId: 'valid', dataUrl: LOGO_URL, reference: `image:${IMAGE_A}` },
      ],
      failedNodeIds: ['first', 'second'],
      generatedIds: 1,
    })
  })
})
