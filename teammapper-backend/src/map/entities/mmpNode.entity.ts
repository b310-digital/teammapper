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
import { validateOrReject, IsDefined } from 'class-validator'

@Entity()
export class MmpNode {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', nullable: true })
  name: string | null

  @ManyToOne(() => MmpMap, (map) => map.nodes, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn()
  nodeMap: MmpMap

  @ManyToOne(() => MmpNode, (node) => node.children, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'nodeMapId', referencedColumnName: 'nodeMapId' },
    { name: 'nodeParentId', referencedColumnName: 'id' },
  ])
  @Index()
  nodeParent: MmpNode

  @OneToMany(() => MmpNode, (node) => node.nodeParent)
  children: MmpNode[]

  @Column({ type: 'boolean', default: false })
  @IsDefined()
  root: boolean

  @Column({ type: 'float' })
  @IsDefined()
  coordinatesX: number

  @Column({ type: 'float' })
  @IsDefined()
  coordinatesY: number

  @Column({ type: 'varchar', nullable: true })
  colorsName: string | null

  @Column({ type: 'varchar', nullable: true })
  colorsBackground: string | null

  @Column({ type: 'varchar', nullable: true })
  colorsBranch: string | null

  @Column({ type: 'integer', nullable: true })
  fontSize: number | null

  @Column({ type: 'varchar', nullable: true })
  fontStyle: string | null

  @Column({ type: 'varchar', nullable: true })
  fontWeight: string | null

  @Column({ type: 'varchar', nullable: true })
  imageSrc: string | null

  @Column({ type: 'integer', nullable: true, default: 60 })
  imageSize: number | null

  @Column({ type: 'varchar', nullable: true })
  linkHref: string | null

  @Column({ type: 'boolean', nullable: true })
  locked: boolean | null

  @Column({ type: 'boolean', default: false })
  @IsDefined()
  detached: boolean

  @Column({ type: 'float', nullable: true })
  k: number | null

  @PrimaryColumn('uuid')
  @Index()
  @IsDefined()
  nodeMapId: string

  @Column({ type: 'uuid', nullable: true })
  nodeParentId: string | null

  @Column({ type: 'integer' })
  @Generated('increment')
  orderNumber: number

  @Column({
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastModified: Date | null

  @Column({
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date | null

  @BeforeInsert()
  @BeforeUpdate()
  async validate() {
    await validateOrReject(this)
  }
}
