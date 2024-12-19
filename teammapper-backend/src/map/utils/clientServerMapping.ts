import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { IMmpClientMap, IMmpClientNode, IMmpClientNodeBasics } from '../types'

const DEFAULT_COLOR_NAME = '#787878'
const DEFAULT_COLOR_BACKGROUND = '#f0f6f5'
const DEFAULT_FONT_SIZE = 20
const DEFAULT_FONT_STYLE = 'normal'
const DEFAULT_FONT_WEIGHT = 'normal'
const DEFAULT_NAME = 'Root node'

const mapMmpNodeToClient = (serverNode: MmpNode): IMmpClientNode => ({
  colors: {
    name: serverNode.colorsName || '',
    background: serverNode.colorsBackground || '',
    branch: serverNode.colorsBranch || '',
  },
  coordinates: {
    x: serverNode.coordinatesX || 0,
    y: serverNode.coordinatesY || 0,
  },
  font: {
    style: serverNode.fontStyle || '',
    size: serverNode.fontSize || 12,
    weight: serverNode.fontWeight || '',
  },
  link: {
    href: serverNode.linkHref || '',
  },
  id: serverNode.id,
  detached: serverNode.detached || false,
  image: { src: serverNode.imageSrc || '', size: serverNode.imageSize || 0 },
  k: serverNode.k || 1,
  locked: serverNode.locked || false,
  name: serverNode.name || '',
  parent: serverNode.nodeParentId,
  isRoot: serverNode.root || false,
})

const mapMmpMapToClient = (
  serverMap: MmpMap,
  serverNodes: MmpNode[],
  deletedAt: Date,
  deleteAfterDays: number
): IMmpClientMap => {
  return {
    uuid: serverMap.id,
    data: serverNodes.map((node) => mapMmpNodeToClient(node)),
    deleteAfterDays,
    deletedAt,
    lastModified: serverMap.lastModified,
    lastAccessed: serverMap.lastAccessed,
    options: serverMap?.options,
    createdAt: serverMap.createdAt,
  }
}

const mergeClientNodeIntoMmpNode = (
  clientNode: Partial<IMmpClientNode>,
  serverNode: MmpNode
): Partial<MmpNode> => ({
  id: clientNode?.id ?? serverNode.id,
  colorsBackground:
    clientNode?.colors?.background ?? serverNode.colorsBackground,
  colorsBranch: clientNode?.colors?.branch ?? serverNode.colorsBranch,
  colorsName: clientNode?.colors?.name ?? serverNode.colorsName,
  coordinatesX: clientNode?.coordinates?.x ?? serverNode.coordinatesX,
  coordinatesY: clientNode?.coordinates?.y ?? serverNode.coordinatesY,
  fontSize: clientNode?.font?.size ?? serverNode.fontSize,
  fontStyle: clientNode?.font?.style ?? serverNode.fontStyle,
  fontWeight: clientNode?.font?.weight ?? serverNode.fontWeight,
  imageSrc: clientNode?.image?.src ?? serverNode.imageSrc,
  imageSize: clientNode?.image?.size ?? serverNode.imageSize,
  k: clientNode?.k ?? serverNode.k,
  linkHref: clientNode?.link?.href ?? serverNode.linkHref,
  locked: clientNode?.locked ?? serverNode.locked,
  detached: clientNode?.detached ?? serverNode.detached,
  name: clientNode?.name !== undefined ? clientNode.name : serverNode.name,
  nodeParentId: clientNode?.parent || serverNode.nodeParentId || undefined,
  root: clientNode?.isRoot ?? serverNode.root,
  nodeMapId: serverNode.nodeMapId,
})

const mapClientNodeToMmpNode = (
  clientNode: IMmpClientNode,
  mapId: string
): Partial<MmpNode> => ({
  id: clientNode.id,
  colorsBackground: clientNode.colors?.background,
  colorsBranch: clientNode.colors?.branch,
  colorsName: clientNode.colors?.name,
  coordinatesX: clientNode.coordinates?.x,
  coordinatesY: clientNode.coordinates?.y,
  fontSize: clientNode.font?.size,
  fontStyle: clientNode.font?.style,
  fontWeight: clientNode.font?.weight,
  imageSrc: clientNode.image?.src,
  imageSize: clientNode.image?.size,
  k: clientNode.k,
  linkHref: clientNode.link?.href,
  locked: clientNode.locked,
  detached: clientNode.detached,
  name: clientNode.name,
  nodeParentId: clientNode.parent || undefined, // This is needed because a client root node defines its parent as an empty string, which is an invalid UUID format
  root: clientNode.isRoot,
  nodeMapId: mapId,
})

// Maps and enhances given properties to a valid root node
const mapClientBasicNodeToMmpRootNode = (
  clientRootNodeBasics: IMmpClientNodeBasics,
  mapId: string
): Partial<MmpNode> => ({
  colorsBackground:
    clientRootNodeBasics.colors.background || DEFAULT_COLOR_BACKGROUND,
  colorsBranch: clientRootNodeBasics.colors.branch,
  colorsName: clientRootNodeBasics.colors.name || DEFAULT_COLOR_NAME,
  coordinatesX: 0,
  coordinatesY: 0,
  fontSize: clientRootNodeBasics.font.size || DEFAULT_FONT_SIZE,
  fontStyle: clientRootNodeBasics.font.style || DEFAULT_FONT_STYLE,
  fontWeight: clientRootNodeBasics.font.weight || DEFAULT_FONT_WEIGHT,
  imageSrc: clientRootNodeBasics.image?.src,
  imageSize: clientRootNodeBasics.image?.size,
  name: clientRootNodeBasics.name || DEFAULT_NAME,
  root: true,
  detached: false,
  nodeMapId: mapId,
})

export {
  mapMmpNodeToClient,
  mapClientNodeToMmpNode,
  mapClientBasicNodeToMmpRootNode,
  mapMmpMapToClient,
  mergeClientNodeIntoMmpNode,
}
