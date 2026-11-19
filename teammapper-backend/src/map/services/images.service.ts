import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { v4 as uuidv4, validate as uuidValidate } from 'uuid'
import {
  IMAGE_REFERENCE_PREFIX,
  ImageReference,
  RasterImageMimeType,
  toImageReference,
} from '@teammapper/shared'
import { MmpImage } from '../entities/mmpImage.entity'
import { ImageStore } from './image-store'
import { totalStoredImageBytes } from '../utils/imageStorage'
import configService from '../../config.service'

const DAY_MS = 24 * 60 * 60 * 1000

// Arbitrarily chosen PostgreSQL advisory lock identifiers. Every backend
// instance must use the same pair; reserve it for map duplication only.
const MAP_DUPLICATION_LOCK_NAMESPACE = 741921
const MAP_DUPLICATION_LOCK_KEY = 1

/** How long an unused image survives after its upload, so undo can restore it. */
export const UNUSED_IMAGE_RETENTION_DAYS = 7

/** An upload that already passed the size and type checks. */
export interface ImageUpload {
  buffer: Buffer
  mimetype: RasterImageMimeType
  size: number
}

export interface StoredImage {
  data: Buffer
  mimetype: RasterImageMimeType
}

/** Stores, reads, copies and deletes node images. Copied maps share the bytes. */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name)

  constructor(
    @InjectRepository(MmpImage)
    private imagesRepository: Repository<MmpImage>,
    private imageStore: ImageStore
  ) {}

  /** A transaction-scoped lock permits one duplication across all instances.
   * Other requests fail immediately instead of queuing expensive work. The
   * operation receives the manager of that transaction and runs every query
   * through it, so a failure rolls back the whole duplication.
   */
  async withDuplicationLimit<T>(
    operation: (manager: EntityManager) => Promise<T>
  ): Promise<T> {
    return this.imagesRepository.manager.transaction(async (manager) => {
      const rows: { acquired: boolean }[] = await manager.query(
        'SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS acquired',
        [MAP_DUPLICATION_LOCK_NAMESPACE, MAP_DUPLICATION_LOCK_KEY]
      )
      if (!rows[0]?.acquired) throw new ThrottlerException()
      return operation(manager)
    })
  }

  /** Checks the map's cap, then stores the upload under a new id. */
  async storeImage(
    mapId: string,
    upload: ImageUpload
  ): Promise<ImageReference> {
    const id = uuidv4()
    await this.reserveImageUpload(mapId, id, upload)
    await this.imageStore.put(id, upload.buffer)
    return toImageReference(id)
  }

  /**
   * Writes the metadata row, then the bytes. A failed byte write leaves a row
   * no node references, which deleteUnusedImages removes, and never bytes
   * without a row, which no job would find. The image extraction job calls
   * this method, because the cap limits uploads and a map may already hold
   * more inline image bytes than the cap allows.
   */
  async storeImageWithoutCap(
    mapId: string,
    id: string,
    upload: ImageUpload
  ): Promise<void> {
    await this.imagesRepository.insert({
      mapId,
      id,
      mimetype: upload.mimetype,
      size: upload.size,
    })
    await this.imageStore.put(id, upload.buffer)
  }

  /** Returns the image the map holds, or null for any other id. */
  async readImage(mapId: string, imageId: string): Promise<StoredImage | null> {
    if (!uuidValidate(imageId)) return null
    const image = await this.imagesRepository.findOne({
      where: { mapId, id: imageId },
    })
    if (!image) return null
    const data = await this.imageStore.get(imageId)
    if (!data) return null
    return { data, mimetype: image.mimetype }
  }

  /**
   * Gives the target map a metadata row for every image of the source map,
   * under the same id, so no node reference needs rewriting. Both maps then
   * share the bytes. The copies count as uploaded now. Pass the manager
   * withDuplicationLimit provides, so the copies roll back with the
   * duplication. Throws before inserting anything when the stored and inline
   * bytes to copy exceed the image cap. Leaves out every image whose bytes a
   * concurrent deletion removed.
   */
  async copyImages(
    manager: EntityManager,
    sourceMapId: string,
    targetMapId: string,
    inlineBytes = 0
  ): Promise<void> {
    const images = await manager.find(MmpImage, {
      where: { mapId: sourceMapId },
    })
    this.assertBelowMapCap(totalStoredImageBytes(images) + inlineBytes)
    const heldIds = new Set(
      await this.imageStore.holdForCopy(
        manager,
        images.map((image) => image.id)
      )
    )
    const held = images.filter((image) => heldIds.has(image.id))
    const dropped = images.filter((image) => !heldIds.has(image.id))
    this.warnAboutDroppedImages(sourceMapId, targetMapId, dropped)
    await this.insertImageReferences(manager, targetMapId, held)
  }

  /**
   * Deletes the metadata rows of the given maps, then the bytes no other map
   * references, inside the transaction of `manager`. Waits for a running
   * duplication that holds those bytes.
   */
  async deleteImagesOfMaps(
    manager: EntityManager,
    mapIds: string[]
  ): Promise<void> {
    const imageIds = await this.deleteImageRows(manager, mapIds)
    await this.imageStore.deleteUnreferenced(manager, imageIds)
  }

  /**
   * Deletes every image that no node row of its map references and that was
   * uploaded more than `afterDays` days ago, with the bytes no other map
   * references. Keeping recent images lets undo restore a removed image for
   * that long. Then deletes all bytes no map references. Returns the number
   * of unused images deleted.
   */
  async deleteUnusedImages(
    afterDays = UNUSED_IMAGE_RETENTION_DAYS
  ): Promise<number> {
    const uploadedBefore = new Date(Date.now() - afterDays * DAY_MS)
    const unused = await this.findUnusedImages(uploadedBefore)
    for (const image of unused) await this.deleteUnusedImage(image)
    await this.imageStore.deleteAllUnreferenced()
    return unused.length
  }

  /** Deletes one metadata row and, unless another map references them, the bytes. */
  private async deleteUnusedImage(image: MmpImage): Promise<void> {
    await this.imagesRepository.manager.transaction(async (manager) => {
      await manager.delete(MmpImage, { mapId: image.mapId, id: image.id })
      await this.imageStore.deleteUnreferenced(manager, [image.id])
    })
  }

  /** Deletes the metadata rows of the maps and returns the image ids they held. */
  private async deleteImageRows(
    manager: EntityManager,
    mapIds: string[]
  ): Promise<string[]> {
    const [rows]: [{ id: string }[], number] = await manager.query(
      'DELETE FROM "mmp_image" WHERE "mapId" = ANY($1::uuid[]) RETURNING "id"',
      [mapIds]
    )
    return rows.map((row) => row.id)
  }

  /** Logs the images a concurrent deletion left without bytes. */
  private warnAboutDroppedImages(
    sourceMapId: string,
    targetMapId: string,
    dropped: MmpImage[]
  ): void {
    if (dropped.length === 0) return
    this.logger.warn(
      `copyImages(): map ${sourceMapId} to map ${targetMapId} dropped images without bytes: ${dropped.map((image) => image.id).join(', ')}`
    )
  }

  /** Inserts a metadata row for each image into the target map. */
  private async insertImageReferences(
    manager: EntityManager,
    targetMapId: string,
    images: MmpImage[]
  ): Promise<void> {
    if (images.length === 0) return
    await manager.insert(
      MmpImage,
      images.map(({ id, mimetype, size }) => ({
        mapId: targetMapId,
        id,
        mimetype,
        size,
      }))
    )
  }

  /** Commits metadata before writing bytes, reserving space for concurrent uploads. */
  private async reserveImageUpload(
    mapId: string,
    id: string,
    upload: ImageUpload
  ): Promise<void> {
    await this.imagesRepository.manager.transaction(async (manager) => {
      // Reserve metadata under a per-map lock, so simultaneous uploads cannot
      // each spend the same remaining space. The byte write follows commit.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [mapId]
      )
      const repository = manager.getRepository(MmpImage)
      await this.assertUploadFitsMap(mapId, upload.size, repository)
      await repository.insert({
        mapId,
        id,
        mimetype: upload.mimetype,
        size: upload.size,
      })
    })
  }

  private assertBelowMapCap(totalBytes: number): void {
    if (totalBytes > configService.getMaxImageBytesPerMap()) {
      throw new PayloadTooLargeException('Image storage of the map is full')
    }
  }

  private findUnusedImages(uploadedBefore: Date): Promise<MmpImage[]> {
    return this.imagesRepository
      .createQueryBuilder('image')
      .where('image.createdAt < :uploadedBefore', { uploadedBefore })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM "mmp_node" "node" WHERE "node"."nodeMapId" = "image"."mapId" AND "node"."imageSrc" = :prefix || "image"."id"::text)`,
        { prefix: IMAGE_REFERENCE_PREFIX }
      )
      .getMany()
  }

  /** Sum of the sizes of the map's images, read from the metadata table. */
  private async totalStoredImageBytesOfMap(
    mapId: string,
    repository: Repository<MmpImage>
  ): Promise<number> {
    const result = await repository
      .createQueryBuilder('image')
      .select('COALESCE(SUM(image.size), 0)', 'total')
      .where('image.mapId = :mapId', { mapId })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  /** Called while holding the map's upload lock, before reserving metadata. */
  private async assertUploadFitsMap(
    mapId: string,
    size: number,
    repository: Repository<MmpImage>
  ): Promise<void> {
    const total = await this.totalStoredImageBytesOfMap(mapId, repository)
    if (total + size > configService.getMaxImageBytesPerMap()) {
      this.logger.warn(`storeImage(): map ${mapId} reached its image cap`)
    }
    this.assertBelowMapCap(total + size)
  }
}
