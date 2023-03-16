import {
  Entity, Column, PrimaryGeneratedColumn, OneToMany, Generated,
} from 'typeorm';
import { MapOptions } from '../types';
import { MmpNode } from './mmpNode.entity';

@Entity()
export class MmpMap {
  @PrimaryGeneratedColumn('uuid')
    id: string;

  @Column({ type: 'timestamptz', nullable: true, default: () => 'now()' })
    lastModified: Date;

  @Column({ nullable: true })
  @Generated('uuid')
    adminId: string;

  @Column({ nullable: true, default: null })
  @Generated('uuid')
    modificationSecret: string;

  @Column({ nullable: true })
    name: string;

  @Column('jsonb', { nullable: false, default: {} })
    options: MapOptions;

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @OneToMany(type => MmpNode, (node) => node.nodeMap, {
    cascade: true,
    })
  /* eslint-enable @typescript-eslint/no-unused-vars */
    nodes: MmpNode[];
}
