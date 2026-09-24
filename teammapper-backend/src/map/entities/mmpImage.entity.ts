import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm'
import type { RasterImageMimeType } from '@teammapper/shared'
import { MmpMap } from './mmpMap.entity'

/**
 * The metadata of one uploaded image. The cap and the cleanup job read only
 * this table; `ImageStore` keeps the bytes.
 */
// Columns take `!` and no initializer; AGENTS.md, TypeScript strictness rule 3.
@Entity('mmp_image')
@Check(
  'CHK_mmp_image_mimetype',
  `"mimetype" IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')`
)
export class MmpImage {
  @PrimaryColumn('uuid')
  mapId!: string

  @PrimaryColumn('uuid')
  id!: string

  @ManyToOne(() => MmpMap, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mapId', foreignKeyConstraintName: 'FK_mmp_image_mapId' })
  map!: MmpMap

  @Column({ type: 'varchar' })
  mimetype!: RasterImageMimeType

  @Column({ type: 'integer' })
  size!: number

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
