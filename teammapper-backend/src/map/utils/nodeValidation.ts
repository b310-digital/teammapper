import { MmpNode } from '../entities/mmpNode.entity'

export const shouldValidateParent = (node: Partial<MmpNode>): boolean =>
  !!node.nodeParentId && !node.root && !node.detached

export const createParentNotFoundWarning = (
  nodeId: string,
  parentId: string,
  mapId: string,
  context: string
): string =>
  `${context}: Cannot update node ${nodeId} - parent ${parentId} does not exist in map ${mapId}`
