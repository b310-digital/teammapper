import { ImageReference, isRasterImageMimeType } from '@teammapper/shared';
import type { ImageUrlResolver } from '@teammapper/mmp';

/** Width in pixels the toolbar and the drop resize an image to. */
const RESIZE_WIDTH = 360;
const RESIZE_TYPE = 'image/jpeg';
const RESIZE_QUALITY = 0.5;

/** Uploads an image to the open map and returns its reference. */
export type ImageUploader = (image: Blob) => Promise<ImageReference>;

/** What `MapSyncService` registers on `MmpService` for the open map. */
export interface ImageHandlers {
  resolveUrl: ImageUrlResolver;
  upload: ImageUploader;
}

/** A failed upload, carrying the HTTP status, or 0 when none arrived. */
export class ImageUploadError extends Error {
  constructor(public readonly status: number) {
    super(`The image upload failed with status ${status}`);
    this.name = 'ImageUploadError';
  }
}

/** True for a PNG, JPEG, GIF or WebP file; the server accepts no other. */
export const isRasterImageFile = (file: Blob): boolean =>
  isRasterImageMimeType(file.type);

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be loaded'));
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      blob =>
        blob
          ? resolve(blob)
          : reject(new Error('The image could not be encoded')),
      RESIZE_TYPE,
      RESIZE_QUALITY
    );
  });

/** Reads a blob as a data URL. */
export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The blob could not be read'));
    reader.onloadend = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The blob could not be read'));
    reader.readAsDataURL(blob);
  });

/**
 * Scales an image to 360 pixels wide, keeping its aspect ratio, and encodes
 * it as JPEG. The result stays below the server's upload size limit. The
 * image loads from a data URL, because the page's CSP allows no blob: images.
 */
export const resizeImage = async (file: Blob): Promise<Blob> => {
  const image = await loadImage(await blobToDataUrl(file));
  const canvas = document.createElement('canvas');
  canvas.width = RESIZE_WIDTH;
  canvas.height = image.height * (RESIZE_WIDTH / image.width);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The canvas context is not available');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
};
