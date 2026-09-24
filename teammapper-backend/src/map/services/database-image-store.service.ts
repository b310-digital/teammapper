import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MmpImageData } from '../entities/mmpImageData.entity'
import { ImageStore } from './image-store'

/** Reads and writes image bytes in `mmp_image_data`. */
@Injectable()
export class DatabaseImageStore extends ImageStore {
  constructor(
    @InjectRepository(MmpImageData)
    private imageDataRepository: Repository<MmpImageData>
  ) {
    super()
  }

  async put(mapId: string, imageId: string, data: Buffer): Promise<void> {
    await this.imageDataRepository.insert({ mapId, id: imageId, data })
  }

  async get(mapId: string, imageId: string): Promise<Buffer | null> {
    const row = await this.imageDataRepository.findOne({
      where: { mapId, id: imageId },
    })
    return row?.data ?? null
  }

  /** Copies inside the database, so the bytes never pass through the server. */
  async copy(
    sourceMapId: string,
    targetMapId: string,
    imageIds: string[]
  ): Promise<void> {
    if (imageIds.length === 0) return
    await this.imageDataRepository.query(
      `INSERT INTO "mmp_image_data" ("mapId", "id", "data")
       SELECT $1, "id", "data" FROM "mmp_image_data"
       WHERE "mapId" = $2 AND "id" = ANY($3::uuid[])
       ON CONFLICT DO NOTHING`,
      [targetMapId, sourceMapId, imageIds]
    )
  }

  async delete(mapId: string, imageId: string): Promise<void> {
    await this.imageDataRepository.delete({ mapId, id: imageId })
  }

  async deleteAllOfMap(mapId: string): Promise<void> {
    await this.imageDataRepository.delete({ mapId })
  }
}
