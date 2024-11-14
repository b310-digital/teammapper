import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  Generated,
  BeforeInsert, 
  BeforeUpdate,
} from 'typeorm'
import { MapOptions } from '../types'
import { MmpNode } from './mmpNode.entity'
import { validateOrReject, IsDefined } from 'class-validator';

@Entity()
export class MmpMap {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'timestamptz', nullable: true, default: () => 'now()' })
  lastModified: Date

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessed: Date

  @Column({ nullable: true })
  @Generated('uuid')
  adminId: string

  @Column({ nullable: true, default: null })
  @Generated('uuid')
  modificationSecret: string

  @Column({ nullable: true })
  name: string

  @Column('jsonb', { nullable: false, default: {} })
  options: MapOptions

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @OneToMany((type) => MmpNode, (node) => node.nodeMap, {
    cascade: true,
  })
  /* eslint-enable @typescript-eslint/no-unused-vars */
  nodes: MmpNode[]

  @Column({ type: 'timestamptz', default: () => 'now()', nullable: true })
  createdAt: Date
}
