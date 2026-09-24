/**
 * Puts and gets the bytes of node images. No other code reads or writes image
 * bytes, so a later object storage switch replaces only the implementation.
 * Callers write the bytes before the metadata row.
 */
export abstract class ImageStore {
  /** Stores the bytes of one image. */
  abstract put(mapId: string, imageId: string, data: Buffer): Promise<void>

  /** Returns the bytes of one image, or null when the store holds none. */
  abstract get(mapId: string, imageId: string): Promise<Buffer | null>
}
