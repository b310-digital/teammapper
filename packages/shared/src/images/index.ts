import * as v from 'valibot';

/**
 * A node image is one of two forms: a reference to an image the map's image
 * endpoint serves, or an inline raster data URL from an existing map, an older
 * client or an import.
 */
export type ImageReference = `image:${string}`;
export type ImageDataUrl = `data:image/${string}`;

export const IMAGE_REFERENCE_PREFIX = 'image:';

/** `image:` followed by a lowercase uuid, nothing else. */
export const IMAGE_REFERENCE_REGEX =
  /^image:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A base64 data URL with a raster MIME type. */
export const IMAGE_DATA_URL_REGEX =
  /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/;

/** The MIME types an uploaded image may declare and contain. */
export const RASTER_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export type RasterImageMimeType = (typeof RASTER_IMAGE_MIME_TYPES)[number];

export const isRasterImageMimeType = (
  mimetype: string
): mimetype is RasterImageMimeType =>
  (RASTER_IMAGE_MIME_TYPES as readonly string[]).includes(mimetype);

export const isImageReference = (
  src: string | null | undefined
): src is ImageReference => !!src && IMAGE_REFERENCE_REGEX.test(src);

export const isImageDataUrl = (
  src: string | null | undefined
): src is ImageDataUrl => !!src && IMAGE_DATA_URL_REGEX.test(src);

/** Builds the reference a node holds for the image with the given id. */
export const toImageReference = (imageId: string): ImageReference =>
  `${IMAGE_REFERENCE_PREFIX}${imageId}`;

/** Returns the image id of a reference. */
export const imageIdOf = (reference: ImageReference): string =>
  reference.slice(IMAGE_REFERENCE_PREFIX.length);

/** The body of a successful `POST /api/maps/:id/images`. */
export const ImageUploadResponseSchema = v.object({
  reference: v.pipe(v.string(), v.regex(IMAGE_REFERENCE_REGEX)),
});

export type ImageUploadResponse = v.InferOutput<
  typeof ImageUploadResponseSchema
>;

/** Returns the reference of an upload response body, or null for any other body. */
export const parseImageUploadResponse = (
  body: unknown
): ImageReference | null => {
  const result = v.safeParse(ImageUploadResponseSchema, body);
  if (!result.success) return null;
  const { reference } = result.output;
  return isImageReference(reference) ? reference : null;
};
