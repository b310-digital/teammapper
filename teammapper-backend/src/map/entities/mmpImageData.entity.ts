import { Entity, Column, PrimaryColumn } from 'typeorm'

/**
 * The bytes of one uploaded image, keyed by the image id alone, which only
 * `DatabaseImageStore` reads and writes. A map and its copies reference the
 * same row through their `mmp_image` rows, and the row goes with the last of
 * them. The table has no foreign key to `mmp_image`. The upload writes the
 * metadata row first, so a failed byte write leaves an unused row that
 * `ImagesService.deleteUnusedImages` removes.
 */
// Columns take `!` and no initializer; AGENTS.md, TypeScript strictness rule 3.
@Entity('mmp_image_data')
export class MmpImageData {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'bytea' })
  data!: Buffer
}
