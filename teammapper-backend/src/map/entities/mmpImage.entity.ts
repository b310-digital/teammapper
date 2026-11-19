import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Check,
  Index,
} from 'typeorm'
import type { RasterImageMimeType } from '@teammapper/shared'
import { MmpMap } from './mmpMap.entity'

/**
 * The metadata of one image a map references. A copied map gets its own row
 * under the same id. The cap and the cleanup job read only this table;
 * `ImageStore` keeps the bytes, one copy per id.
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

  // Serves the check whether any map still references the bytes of an image.
  @Index('IDX_mmp_image_id')
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
