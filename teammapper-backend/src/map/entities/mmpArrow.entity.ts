import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm'
import { MmpMap } from './mmpMap.entity'
import { MmpNode } from './mmpNode.entity'

/**
 * A directed arrow between two nodes of one map. The primary key is the arrow
 * key (map, source, target), so a map holds one arrow per pair. The composite
 * foreign keys to `mmp_node (nodeMapId, id)` forbid an arrow that names a node
 * of another map or a missing node, and delete the arrow with either node.
 */
// Columns take `!` and no initializer; AGENTS.md, TypeScript strictness rule 3.
@Entity('mmp_arrow')
export class MmpArrow {
  @PrimaryColumn('uuid')
  nodeMapId!: string

  @PrimaryColumn('uuid')
  sourceNodeId!: string

  @PrimaryColumn('uuid')
  targetNodeId!: string

  @ManyToOne(() => MmpMap, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'nodeMapId',
    foreignKeyConstraintName: 'FK_mmp_arrow_nodeMapId',
  })
  nodeMap!: MmpMap

  @ManyToOne(() => MmpNode, { onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'nodeMapId',
      referencedColumnName: 'nodeMapId',
      foreignKeyConstraintName: 'FK_mmp_arrow_source',
    },
    { name: 'sourceNodeId', referencedColumnName: 'id' },
  ])
  sourceNode!: MmpNode

  @ManyToOne(() => MmpNode, { onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'nodeMapId',
      referencedColumnName: 'nodeMapId',
      foreignKeyConstraintName: 'FK_mmp_arrow_target',
    },
    { name: 'targetNodeId', referencedColumnName: 'id' },
  ])
  targetNode!: MmpNode
}
