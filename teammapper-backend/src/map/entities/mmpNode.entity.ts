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
  BeforeInsert, 
  BeforeUpdate,
} from 'typeorm'
import { MmpMap } from './mmpMap.entity'
import { validateOrReject, IsDefined } from 'class-validator';

@Entity()
export class MmpNode {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ nullable: true })
  name: string

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @ManyToOne((type) => MmpMap, (map) => map.nodes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  nodeMap: MmpMap
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @ManyToOne((type) => MmpNode, (node) => node.children, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'nodeMapId', referencedColumnName: 'nodeMapId' },
    { name: 'nodeParentId', referencedColumnName: 'id' },
  ])
  @Index()
  nodeParent: MmpNode
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /* eslint-disable @typescript-eslint/no-unused-vars */
  @OneToMany((type) => MmpNode, (node) => node.nodeParent)
  children: MmpNode[]
  /* eslint-enable @typescript-eslint/no-unused-vars */

  @Column({ default: false })
  @IsDefined()
  root: boolean

  @Column({ type: 'float' })
  @IsDefined()
  coordinatesX: number

  @Column({ type: 'float' })
  @IsDefined()
  coordinatesY: number

  @Column({ nullable: true })
  colorsName: string

  @Column({ nullable: true })
  colorsBackground: string

  @Column({ nullable: true })
  colorsBranch: string

  @Column({ nullable: true })
  fontSize: number

  @Column({ nullable: true })
  fontStyle: string

  @Column({ nullable: true })
  fontWeight: string

  @Column({ nullable: true })
  imageSrc: string

  @Column({ nullable: true, default: 60 })
  imageSize: number

  @Column({ nullable: true })
  linkHref: string

  @Column({ nullable: true })
  locked: boolean

  @Column({ default: false })
  detached: boolean

  @Column({ nullable: true, type: 'float' })
  k: number

  @PrimaryColumn('uuid')
  @Index()
  nodeMapId: string

  @Column({ nullable: true })
  nodeParentId: string

  @Column({ nullable: false })
  @Generated('increment')
  orderNumber: number

  @Column({ type: 'timestamptz', nullable: true, default: () => 'now()' })
  lastModified: Date

  @Column({ type: 'timestamptz', default: () => 'now()', nullable: true })
  createdAt: Date

  @BeforeInsert()
  @BeforeUpdate()
  async validate() {
    await validateOrReject(this);
  }
}
