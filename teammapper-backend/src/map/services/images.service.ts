import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { v4 as uuidv4, validate as uuidValidate } from 'uuid'
import {
  ImageReference,
  RasterImageMimeType,
  toImageReference,
} from '@teammapper/shared'
import { MmpImage } from '../entities/mmpImage.entity'
import { ImageStore } from './image-store'
import configService from '../../config.service'

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

/** Stores and reads node images. */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name)

  constructor(
    @InjectRepository(MmpImage)
    private imagesRepository: Repository<MmpImage>,
    private imageStore: ImageStore
  ) {}

  /**
   * Checks the map's cap, writes the bytes, then the metadata row, so a crash
   * never leaves a row whose bytes are missing.
   */
  async storeImage(
    mapId: string,
    upload: ImageUpload
  ): Promise<ImageReference> {
    await this.assertBelowCap(mapId, upload.size)
    const id = uuidv4()
    await this.imageStore.put(mapId, id, upload.buffer)
    await this.imagesRepository.insert({
      mapId,
      id,
      mimetype: upload.mimetype,
      size: upload.size,
    })
    return toImageReference(id)
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
