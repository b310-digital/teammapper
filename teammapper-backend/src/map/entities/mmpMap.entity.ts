import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  Generated,
} from 'typeorm'
import { MapOptions } from '@teammapper/shared'
import { MmpNode } from './mmpNode.entity'

// Every column below carries a definite assignment assertion. TypeORM fills
// these in when it hydrates or inserts a row, and an initializer would emit a
// real assignment, which makes the insert write that value instead of letting
// the column default apply.
@Entity()
export class MmpMap {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastModified!: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessed!: Date | null

  @Column({ type: 'uuid', nullable: true })
  @Generated('uuid')
  adminId!: string | null

  @Column({ type: 'varchar', nullable: true })
  ownerExternalId?: string | null

  @Column({ type: 'uuid', nullable: true, default: null })
  @Generated('uuid')
  modificationSecret!: string | null

  @Column({ type: 'varchar', nullable: true })
  name!: string | null

  @Column('jsonb', {
    nullable: false,
    default: {},
  })
  options!: MapOptions

  @OneToMany(() => MmpNode, (node) => node.nodeMap, {
    cascade: true,
  })
  nodes!: MmpNode[]

  @Column({
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date | null
}
