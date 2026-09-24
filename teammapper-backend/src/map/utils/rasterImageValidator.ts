import { FileValidator } from '@nestjs/common'
import { isRasterImageMimeType, RasterImageMimeType } from '@teammapper/shared'

/** The fields of a multer file the validator reads, shaped like Nest's `IFile`. */
export interface UploadedImageFile {
  mimetype: string
  size: number
  buffer?: Buffer
}

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte)

const ascii = (text: string): number[] =>
  Array.from(text, (char) => char.charCodeAt(0))

/** Magic byte checks per raster type. */
const SIGNATURES: Record<RasterImageMimeType, (buffer: Buffer) => boolean> = {
  'image/jpeg': (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  'image/png': (buffer) =>
    startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (buffer) =>
    startsWith(buffer, ascii('GIF87a')) || startsWith(buffer, ascii('GIF89a')),
  'image/webp': (buffer) =>
    startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8),
}

/**
 * Accepts a file only when its declared type is a raster type and its magic
 * bytes match that type. The client chooses the declared type freely, so the
 * bytes decide.
 */
export class RasterImageValidator extends FileValidator<
  Record<string, never>,
  UploadedImageFile
> {
  constructor() {
    super({})
  }

  isValid(file?: UploadedImageFile): boolean {
    if (!file?.buffer || !isRasterImageMimeType(file.mimetype)) return false
    return SIGNATURES[file.mimetype](file.buffer)
  }

  buildErrorMessage(): string {
    return 'Validation failed (expected a JPEG, PNG, GIF or WebP image)'
  }
}
