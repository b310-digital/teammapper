import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common'
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
import configService from '../../config.service'

const DAY_MS = 24 * 60 * 60 * 1000

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

  /** Checks the map's cap, then stores the upload under a new id. */
  async storeImage(
    mapId: string,
    upload: ImageUpload
  ): Promise<ImageReference> {
    await this.assertBelowCap(mapId, upload.size)
    const id = uuidv4()
    await this.storeImageWithoutCap(mapId, id, upload)
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
   * does.
   */
  async copyImages(sourceMapId: string, targetMapId: string): Promise<void> {
    const images = await this.imagesRepository.find({
      where: { mapId: sourceMapId },
    })
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
  private async totalBytesOfMap(mapId: string): Promise<number> {
    const result = await this.imagesRepository
      .createQueryBuilder('image')
      .select('COALESCE(SUM(image.size), 0)', 'total')
      .where('image.mapId = :mapId', { mapId })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  /**
   * Takes no lock: concurrent uploads can together exceed the cap by the
   * uploads in flight, each at most UPLOAD_IMAGE_MAX_SIZE_BYTES. The design
   * accepts that; the rate limit bounds it.
   */
  private async assertBelowCap(mapId: string, size: number): Promise<void> {
    const total = await this.totalBytesOfMap(mapId)
    if (total + size > configService.getMaxImageBytesPerMap()) {
      this.logger.warn(`storeImage(): map ${mapId} reached its image cap`)
      throw new PayloadTooLargeException('Image storage of the map is full')
    }
  }
}
