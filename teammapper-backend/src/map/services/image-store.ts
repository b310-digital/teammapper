import { EntityManager } from 'typeorm'

/**
 * Stores the bytes of node images, one entry per image id, which a map and
 * its copies share. No other code reads or writes image bytes, so a switch to
 * object storage replaces only the implementation. Callers write the metadata
 * row before the bytes and delete it before the bytes.
 *
 * Locking: a copy locks the bytes shared, a deletion locks them exclusively,
 * both in id order. A deletion therefore waits for a running copy before it
 * deletes the bytes no metadata row references.
 *
 * Bytes written after a concurrent map deletion stay unreferenced until the
 * daily job calls deleteAllUnreferenced.
 */
export abstract class ImageStore {
  /** Stores the bytes of one image. */
  abstract put(imageId: string, data: Buffer): Promise<void>

  /** Returns the bytes of one image, or null when they are missing. */
  abstract get(imageId: string): Promise<Buffer | null>

  /**
   * Locks the bytes of the given images for a copy until the transaction of
   * `manager` ends. Returns the ids whose bytes exist.
   */
  abstract holdForCopy(
    manager: EntityManager,
    imageIds: string[]
  ): Promise<string[]>

  /**
   * Deletes the bytes of the given images that no metadata row references,
   * inside the transaction of `manager`, and returns how many it deleted.
   * Call it after deleting the metadata rows in that transaction.
   */
  abstract deleteUnreferenced(
    manager: EntityManager,
    imageIds: string[]
  ): Promise<number>

  /**
   * Deletes all bytes that no metadata row references. Returns the number of
   * images whose bytes it deleted.
   */
  abstract deleteAllUnreferenced(): Promise<number>
}
