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
}
