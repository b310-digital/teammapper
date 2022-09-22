import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Generated,
  OneToMany,
} from 'typeorm';
import { MmpMap } from './mmpMap.entity';

@Entity()
export class MmpNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @ManyToOne(type => MmpMap, (map) => map.nodes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  nodeMap: MmpMap;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @ManyToOne(type => MmpNode, (node) => node.children, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'nodeMapId', referencedColumnName: 'nodeMapId' },
    { name: 'nodeParentId', referencedColumnName: 'id' },
  ])
  nodeParent: MmpNode;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @OneToMany(type => MmpNode, (node) => node.nodeParent)
  children: MmpNode[];
  /* eslint-enable @typescript-eslint/no-unused-vars */

  @Column({ default: false })
  root: boolean;

  @Column({ type: 'float' })
  coordinatesX: number;

  @Column({ type: 'float' })
  coordinatesY: number;

  @Column({ nullable: true })
  colorsName: string;

  @Column({ nullable: true })
  colorsBackground: string;

  @Column({ nullable: true })
  colorsBranch: string;

  @Column({ nullable: true })
  fontSize: number;

  @Column({ nullable: true })
  fontStyle: string;

  @Column({ nullable: true })
  fontWeight: string;

  @Column({ nullable: true })
  imageSrc: string;

  @Column({ nullable: true, default: 60 })
  imageSize: number;

  @Column({ nullable: true })
  locked: boolean;

  @Column({ nullable: true, type: 'float' })
  k: number;

  @PrimaryColumn('uuid')
  @Index()
  nodeMapId: string;

  @Column({ nullable: true })
  nodeParentId: string;

  @Column({ nullable: false })
  @Generated('increment')
  orderNumber: number;
}
