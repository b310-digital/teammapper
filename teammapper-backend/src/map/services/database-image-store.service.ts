import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { MmpImageData } from '../entities/mmpImageData.entity'
import { ImageStore } from './image-store'

/** A condition that holds for the bytes of `alias` no metadata row references. */
const notReferenced = (alias: string): string =>
  `NOT EXISTS (SELECT 1 FROM "mmp_image" "image" WHERE "image"."id" = "${alias}"."id")`

/**
 * Reads and writes image bytes in `mmp_image_data`, one row per image id.
 * Implements the locking contract of `ImageStore` with row locks.
 */
@Injectable()
export class DatabaseImageStore extends ImageStore {
  constructor(
    @InjectRepository(MmpImageData)
    private imageDataRepository: Repository<MmpImageData>
  ) {
    super()
  }

  async put(imageId: string, data: Buffer): Promise<void> {
    await this.imageDataRepository.insert({ id: imageId, data })
  }

  async get(imageId: string): Promise<Buffer | null> {
    const row = await this.imageDataRepository.findOne({
      where: { id: imageId },
    })
    return row?.data ?? null
  }

  /** Locks the rows FOR SHARE, which blocks deleteUnreferenced until commit. */
  async holdForCopy(
    manager: EntityManager,
    imageIds: string[]
  ): Promise<string[]> {
    if (imageIds.length === 0) return []
    const rows: { id: string }[] = await manager.query(
      `SELECT "id" FROM "mmp_image_data" WHERE "id" = ANY($1::uuid[])
       ORDER BY "id" FOR SHARE`,
      [imageIds]
    )
    return rows.map((row) => row.id)
  }

  /**
   * Waits for every copy that holds the rows, then deletes the unreferenced
   * ones. The delete runs as a second statement, so under READ COMMITTED it
   * sees the metadata rows a copy committed while this one waited.
   */
  async deleteUnreferenced(
    manager: EntityManager,
    imageIds: string[]
  ): Promise<number> {
    if (imageIds.length === 0) return 0
    await this.lockForDelete(manager, imageIds)
    const result = await manager
      .createQueryBuilder()
      .delete()
      .from(MmpImageData)
      .where('"id" IN (:...imageIds)', { imageIds })
      .andWhere(notReferenced('mmp_image_data'))
      .execute()
    return result.affected ?? 0
  }

  /** Locks and deletes the candidates in one transaction, as deleteUnreferenced does. */
  async deleteAllUnreferenced(): Promise<number> {
    return this.imageDataRepository.manager.transaction(async (manager) => {
      const candidates = await manager
        .createQueryBuilder(MmpImageData, 'mmp_image_data')
        .select('mmp_image_data.id', 'id')
        .where(notReferenced('mmp_image_data'))
        .getRawMany<{ id: string }>()
      const imageIds = candidates.map((candidate) => candidate.id)
      return this.deleteUnreferenced(manager, imageIds)
    })
  }

  /** Locks the rows FOR UPDATE in id order, which waits for every FOR SHARE holder. */
  private async lockForDelete(
    manager: EntityManager,
    imageIds: string[]
  ): Promise<void> {
    await manager.query(
      `SELECT "id" FROM "mmp_image_data" WHERE "id" = ANY($1::uuid[])
       ORDER BY "id" FOR UPDATE`,
      [imageIds]
    )
  }
}
