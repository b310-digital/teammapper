import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm'
import { MmpMap } from './mmpMap.entity'

/**
 * The bytes of one uploaded image, which only `DatabaseImageStore` reads and
 * writes. The table has no foreign key to `mmp_image`, because the upload
 * writes the bytes before the metadata row.
 */
// Columns take `!` and no initializer; AGENTS.md, TypeScript strictness rule 3.
@Entity('mmp_image_data')
export class MmpImageData {
  @PrimaryColumn('uuid')
  mapId!: string

  @PrimaryColumn('uuid')
  id!: string

  @ManyToOne(() => MmpMap, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'mapId',
    foreignKeyConstraintName: 'FK_mmp_image_data_mapId',
  })
  map!: MmpMap

  @Column({ type: 'bytea' })
  data!: Buffer
}
