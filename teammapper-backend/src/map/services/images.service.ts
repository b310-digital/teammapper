import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
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

/** Stores, reads, copies and deletes node images. */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name)

  constructor(
    @InjectRepository(MmpImage)
    private imagesRepository: Repository<MmpImage>,
    private imageStore: ImageStore
  ) {}

  /** A transaction-scoped lock permits one duplication across all instances.
   * Other requests fail immediately instead of queuing expensive work.
   */
  async withDuplicationLimit<T>(operation: () => Promise<T>): Promise<T> {
    return this.imagesRepository.manager.transaction(async (manager) => {
      const rows: { acquired: boolean }[] = await manager.query(
        'SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS acquired',
        [MAP_DUPLICATION_LOCK_NAMESPACE, MAP_DUPLICATION_LOCK_KEY]
      )
      if (!rows[0]?.acquired) throw new ThrottlerException()
      return operation()
    })
  }

  /** Checks the map's cap, then stores the upload under a new id. */
  async storeImage(
    mapId: string,
    upload: ImageUpload
  ): Promise<ImageReference> {
    const id = uuidv4()
    await this.reserveImageUpload(mapId, id, upload)
    await this.imageStore.put(mapId, id, upload.buffer)
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
    await this.imageStore.put(mapId, id, upload.buffer)
  }

  /** Returns the image the map holds, or null for any other id. */
  async readImage(mapId: string, imageId: string): Promise<StoredImage | null> {
    if (!uuidValidate(imageId)) return null
    const image = await this.imagesRepository.findOne({
      where: { mapId, id: imageId },
    })
    if (!image) return null
    const data = await this.imageStore.get(mapId, imageId)
    if (!data) return null
    return { data, mimetype: image.mimetype }
  }

  /**
   * Copies every image of the source map to the target map under the same
   * id, so no node reference needs rewriting. The copies count as uploaded
   * now. Writes the metadata rows before the bytes, as storeImageWithoutCap
   * does. Call within withDuplicationLimit so budget checks and copies
   * cannot race another duplication.
   */
  async copyImages(
    sourceMapId: string,
    targetMapId: string,
    inlineBytes = 0
  ): Promise<void> {
    const images = await this.imagesRepository.find({
      where: { mapId: sourceMapId },
    })
    const copyBytes = totalStoredImageBytes(images) + inlineBytes
    await this.assertDuplicationFitsImageLimits(copyBytes)
    if (images.length === 0) return
    await this.imagesRepository.insert(
      images.map(({ id, mimetype, size }) => ({
        mapId: targetMapId,
        id,
        mimetype,
        size,
      }))
    )
    await this.imageStore.copy(
      sourceMapId,
      targetMapId,
      images.map((image) => image.id)
    )
  }

  /** Deletes the metadata rows of a map, then the bytes. */
  async deleteImagesOfMap(mapId: string): Promise<void> {
    await this.imagesRepository.delete({ mapId })
    await this.imageStore.deleteAllOfMap(mapId)
  }

  /**
   * Deletes every image that no node row of its map references and that was
   * uploaded more than `afterDays` days ago. Keeping recent images lets undo
   * restore a removed image for that long. Returns the number deleted.
   */
  async deleteUnusedImages(
    afterDays = UNUSED_IMAGE_RETENTION_DAYS
  ): Promise<number> {
    const uploadedBefore = new Date(Date.now() - afterDays * DAY_MS)
    const unused = await this.findUnusedImages(uploadedBefore)
    for (const image of unused) {
      await this.imagesRepository.delete({ mapId: image.mapId, id: image.id })
      await this.imageStore.delete(image.mapId, image.id)
    }
    return unused.length
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

  /** Requires the duplication lock until the copy and its nodes are stored. */
  private async assertDuplicationFitsImageLimits(
    copyBytes: number
  ): Promise<void> {
    this.assertBelowMapCap(copyBytes)
    const storedBytes = await this.totalImageBytesAcrossMaps()
    if (
      copyBytes > 0 &&
      storedBytes + copyBytes > configService.getDuplicateMapMaxImageBytes()
    ) {
      throw new PayloadTooLargeException(
        'Image storage budget for map duplication is full'
      )
    }
  }

  /** Counts referenced and inline images across every map, including duplicates. */
  private async totalImageBytesAcrossMaps(): Promise<number> {
    const totals: { total: string }[] = await this.imagesRepository.query(`
      SELECT (SELECT COALESCE(SUM(size), 0) FROM mmp_image)
        + (SELECT COALESCE(SUM(octet_length("imageSrc")), 0)
           FROM mmp_node WHERE "imageSrc" LIKE 'data:%') AS total
    `)
    return Number(totals[0]?.total ?? 0)
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
