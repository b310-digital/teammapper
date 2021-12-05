import {
  Entity, Column, PrimaryGeneratedColumn, OneToMany,
} from 'typeorm';
import { MmpNode } from './mmpNode.entity';

@Entity()
export class MmpMap {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastModified: Date;

  @Column({ nullable: true })
  name: string;

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @OneToMany(type => MmpNode, (node) => node.nodeMap, {
    cascade: true,
  })
  /* eslint-enable @typescript-eslint/no-unused-vars */
  nodes: MmpNode[];
}
