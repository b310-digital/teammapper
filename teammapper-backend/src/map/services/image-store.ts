/**
 * Puts, gets, copies and deletes the bytes of node images. No other code reads
 * or writes image bytes, so a later object storage switch replaces only the
 * implementation. Callers write the metadata row before the bytes and delete
 * the metadata row before the bytes.
 */
export abstract class ImageStore {
  /** Stores the bytes of one image. */
  abstract put(mapId: string, imageId: string, data: Buffer): Promise<void>

  /** Returns the bytes of one image, or null when the store holds none. */
  abstract get(mapId: string, imageId: string): Promise<Buffer | null>

  /** Copies the bytes of the given images to another map under the same ids. */
  abstract copy(
    sourceMapId: string,
    targetMapId: string,
    imageIds: string[]
  ): Promise<void>

  /** Deletes the bytes of one image. */
  abstract delete(mapId: string, imageId: string): Promise<void>

  /** Deletes the bytes of every image of one map. */
  abstract deleteAllOfMap(mapId: string): Promise<void>
}
