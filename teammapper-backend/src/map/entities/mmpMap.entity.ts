import {
  Entity, Column, PrimaryGeneratedColumn, OneToMany, Generated,
} from 'typeorm';
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

  @Column({ nullable: true })
    name: string;

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @OneToMany(type => MmpNode, (node) => node.nodeMap, {
    cascade: true,
    })
  /* eslint-enable @typescript-eslint/no-unused-vars */
    nodes: MmpNode[];
}
