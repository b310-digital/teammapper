import * as v from 'valibot';
import {
  ImageUploadResponseSchema,
  imageIdOf,
  isImageDataUrl,
  isImageReference,
  parseImageUploadResponse,
  toImageReference,
} from './index';

const IMAGE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('Node images', () => {
  describe('isImageReference', () => {
    it('accepts image: followed by a lowercase uuid', () => {
      expect(isImageReference(`image:${IMAGE_ID}`)).toBe(true);
    });

    it.each([
      'image:../secret',
      `image:${IMAGE_ID.toUpperCase()}`,
      `image:${IMAGE_ID}/x`,
      `IMAGE:${IMAGE_ID}`,
      'image:',
      '',
      null,
      undefined,
    ])('rejects %p', value => {
      expect(isImageReference(value)).toBe(false);
    });
  });

  describe('isImageDataUrl', () => {
    it('accepts a raster data URL', () => {
      expect(isImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    });

    it('rejects an SVG data URL', () => {
      expect(isImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    });
  });

  it('builds and splits a reference', () => {
    const reference = toImageReference(IMAGE_ID);

    expect(reference).toBe(`image:${IMAGE_ID}`);
    expect(imageIdOf(reference)).toBe(IMAGE_ID);
  });

  it('parses an upload response carrying a reference', () => {
    const result = v.safeParse(ImageUploadResponseSchema, {
      reference: `image:${IMAGE_ID}`,
    });

    expect(result.success).toBe(true);
  });

  it('reads the reference out of an upload response', () => {
    expect(parseImageUploadResponse({ reference: `image:${IMAGE_ID}` })).toBe(
      `image:${IMAGE_ID}`
    );
    expect(parseImageUploadResponse({ reference: 'image:../x' })).toBeNull();
    expect(parseImageUploadResponse(null)).toBeNull();
  });

  it('rejects an upload response carrying a URL', () => {
    const result = v.safeParse(ImageUploadResponseSchema, {
      reference: 'https://example.com/a.png',
    });

    expect(result.success).toBe(false);
  });
});
