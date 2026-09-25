import { decodeImageDataUrl, extractImageDataUrls } from './imageExtraction'

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
])
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x03])
const GIF_BYTES = Buffer.from('GIF89a-gif', 'ascii')
const WEBP_BYTES = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'ascii')

const dataUrl = (type: string, bytes: Buffer): string =>
  `data:image/${type};base64,${bytes.toString('base64')}`

const PNG_URL = dataUrl('png', PNG_BYTES)
const JPEG_URL = dataUrl('jpeg', JPEG_BYTES)

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
  it.each([
    ['png', PNG_BYTES],
    ['jpeg', JPEG_BYTES],
    ['gif', GIF_BYTES],
    ['webp', WEBP_BYTES],
  ])('decodes a %s data URL', (type, bytes) => {
    expect(decodeImageDataUrl(dataUrl(type, bytes))).toEqual({
      mimetype: `image/${type}`,
      data: bytes,
    })
  })

  it.each([null, undefined, ''])('returns null for %p', (src) => {
    expect(decodeImageDataUrl(src)).toBeNull()
  })

  it('returns null for an image reference', () => {
    expect(decodeImageDataUrl(`image:${IMAGE_A}`)).toBeNull()
  })

  it('returns null for a non-raster type', () => {
    expect(
      decodeImageDataUrl(dataUrl('svg+xml', Buffer.from('<svg/>')))
    ).toBeNull()
  })

  it('returns null for a data URL that is not base64', () => {
    expect(decodeImageDataUrl('data:image/png,abc')).toBeNull()
  })

  it('returns null for base64 with characters outside the alphabet', () => {
    expect(decodeImageDataUrl('data:image/png;base64,iVBO\nRw0K')).toBeNull()
  })

  it('returns null when the bytes do not match the declared type', () => {
    expect(decodeImageDataUrl(dataUrl('png', JPEG_BYTES))).toBeNull()
  })

  it('returns null for a payload shorter than the signature', () => {
    expect(decodeImageDataUrl('data:image/png;base64,iVA=')).toBeNull()
  })
})

describe('extractImageDataUrls', () => {
  it('moves an inline image out and replaces it with a reference', () => {
    const result = extractImageDataUrls(
      [{ id: 'node-1', imageSrc: PNG_URL }],
      sequentialIds(IMAGE_A)
    )

    expect(result).toEqual({
      images: [
        {
          id: IMAGE_A,
          mimetype: 'image/png',
          data: PNG_BYTES,
          size: PNG_BYTES.length,
        },
      ],
      replacements: [
        { nodeId: 'node-1', dataUrl: PNG_URL, reference: `image:${IMAGE_A}` },
      ],
      failedNodeIds: [],
    })
  })

  it('gives each distinct data URL its own image', () => {
    const result = extractImageDataUrls(
      [
        { id: 'node-1', imageSrc: PNG_URL },
        { id: 'node-2', imageSrc: JPEG_URL },
      ],
      sequentialIds(IMAGE_A, IMAGE_B)
    )

    expect({
      images: result.images.map((image) => [image.id, image.mimetype]),
      replacements: result.replacements,
    }).toEqual({
      images: [
        [IMAGE_A, 'image/png'],
        [IMAGE_B, 'image/jpeg'],
      ],
      replacements: [
        { nodeId: 'node-1', dataUrl: PNG_URL, reference: `image:${IMAGE_A}` },
        { nodeId: 'node-2', dataUrl: JPEG_URL, reference: `image:${IMAGE_B}` },
      ],
    })
  })

  it('stores one image for nodes holding the same data URL', () => {
    const result = extractImageDataUrls(
      [
        { id: 'node-1', imageSrc: PNG_URL },
        { id: 'node-2', imageSrc: PNG_URL },
      ],
      sequentialIds(IMAGE_A, IMAGE_B)
    )

    expect({
      imageIds: result.images.map((image) => image.id),
      replacements: result.replacements,
    }).toEqual({
      imageIds: [IMAGE_A],
      replacements: [
        { nodeId: 'node-1', dataUrl: PNG_URL, reference: `image:${IMAGE_A}` },
        { nodeId: 'node-2', dataUrl: PNG_URL, reference: `image:${IMAGE_A}` },
      ],
    })
  })

  it('leaves nodes without a valid inline image unchanged', () => {
    const result = extractImageDataUrls(
      [
        { id: 'empty', imageSrc: null },
        { id: 'blank', imageSrc: '' },
        { id: 'reference', imageSrc: `image:${IMAGE_B}` },
        { id: 'svg', imageSrc: dataUrl('svg+xml', Buffer.from('<svg/>')) },
        { id: 'mismatch', imageSrc: dataUrl('png', JPEG_BYTES) },
      ],
      sequentialIds(IMAGE_A)
    )

    expect(result).toEqual({
      images: [],
      replacements: [],
      failedNodeIds: ['svg', 'mismatch'],
    })
  })

  it('lists no node without a data URL as failed', () => {
    const result = extractImageDataUrls([
      { id: 'empty', imageSrc: null },
      { id: 'reference', imageSrc: `image:${IMAGE_B}` },
    ])

    expect(result.failedNodeIds).toEqual([])
  })

  it('lists every node holding a data URL that fails to decode', () => {
    const invalid = dataUrl('png', JPEG_BYTES)

    const result = extractImageDataUrls(
      [
        { id: 'first', imageSrc: invalid },
        { id: 'valid', imageSrc: PNG_URL },
        { id: 'second', imageSrc: invalid },
      ],
      sequentialIds(IMAGE_A)
    )

    expect(result.failedNodeIds).toEqual(['first', 'second'])
  })

  it('draws no id for a data URL that fails to decode', () => {
    const generateId = jest.fn(() => IMAGE_A)

    extractImageDataUrls(
      [{ id: 'mismatch', imageSrc: dataUrl('png', JPEG_BYTES) }],
      generateId
    )

    expect(generateId).not.toHaveBeenCalled()
  })

  it('draws one id per distinct data URL', () => {
    const generateId = jest.fn(sequentialIds(IMAGE_A, IMAGE_B))

    extractImageDataUrls(
      [
        { id: 'node-1', imageSrc: PNG_URL },
        { id: 'node-2', imageSrc: PNG_URL },
        { id: 'node-3', imageSrc: JPEG_URL },
      ],
      generateId
    )

    expect(generateId).toHaveBeenCalledTimes(2)
  })

  it('replaces the valid images and skips the invalid ones of one map', () => {
    const result = extractImageDataUrls(
      [
        { id: 'invalid', imageSrc: dataUrl('png', JPEG_BYTES) },
        { id: 'valid', imageSrc: JPEG_URL },
      ],
      sequentialIds(IMAGE_A)
    )

    expect(result.replacements).toEqual([
      { nodeId: 'valid', dataUrl: JPEG_URL, reference: `image:${IMAGE_A}` },
    ])
  })

  it('generates uuids by default', () => {
    const { images } = extractImageDataUrls([
      { id: 'node-1', imageSrc: PNG_URL },
    ])

    expect(images[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it('returns nothing for no nodes', () => {
    expect(extractImageDataUrls([])).toEqual({
      images: [],
      replacements: [],
      failedNodeIds: [],
    })
  })
})
