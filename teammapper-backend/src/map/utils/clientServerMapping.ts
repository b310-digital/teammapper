import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  ClientMap,
  DEFAULT_ROOT_COLOR_BACKGROUND,
  DEFAULT_ROOT_COLOR_NAME,
  DEFAULT_ROOT_FONT_SIZE,
  DEFAULT_ROOT_FONT_STYLE,
  DEFAULT_ROOT_FONT_WEIGHT,
  DEFAULT_ROOT_NAME,
  IMmpClientNode,
  IMmpClientNodeBasics,
  MapNode,
} from '@teammapper/shared'
import { sanitizeNodeFields } from './sanitization'

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
  image: { src: serverNode.imageSrc || '', size: serverNode.imageSize || 0 },
  k: serverNode.k || 1,
  protected: serverNode.protected ?? false,
  name: serverNode.name || '',
  parent: serverNode.nodeParentId,
  isRoot: serverNode.root || false,
})

const mapMmpMapToClient = (
  serverMap: MmpMap,
  serverNodes: MmpNode[],
  deletedAt: Date,
  deleteAfterDays: number
): ClientMap => {
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

const mapClientNodeToMmpNode = (
  clientNode: IMmpClientNode | MapNode,
  mapId: string
): Partial<MmpNode> =>
  sanitizeNodeFields({
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
    protected: clientNode.protected,
    name: clientNode.name,
    // An older client or an old export may still send '' for a root, which is
    // no valid UUID.
    nodeParentId: clientNode.parent || undefined,
    root: clientNode.isRoot,
    nodeMapId: mapId,
  })

// Maps and enhances given properties to a valid root node
const mapClientBasicNodeToMmpRootNode = (
  clientRootNodeBasics: IMmpClientNodeBasics,
  mapId: string
): Partial<MmpNode> => {
  const sanitized = sanitizeNodeFields({
    colorsBackground: clientRootNodeBasics.colors.background,
    colorsBranch: clientRootNodeBasics.colors.branch,
    colorsName: clientRootNodeBasics.colors.name,
    fontStyle: clientRootNodeBasics.font.style,
    fontWeight: clientRootNodeBasics.font.weight,
    imageSrc: clientRootNodeBasics.image?.src,
    name: clientRootNodeBasics.name,
  })

  return {
    ...sanitized,
    colorsBackground:
      sanitized.colorsBackground || DEFAULT_ROOT_COLOR_BACKGROUND,
    colorsName: sanitized.colorsName || DEFAULT_ROOT_COLOR_NAME,
    coordinatesX: 0,
    coordinatesY: 0,
    fontSize: clientRootNodeBasics.font.size || DEFAULT_ROOT_FONT_SIZE,
    fontStyle: sanitized.fontStyle || DEFAULT_ROOT_FONT_STYLE,
    fontWeight: sanitized.fontWeight || DEFAULT_ROOT_FONT_WEIGHT,
    imageSize: clientRootNodeBasics.image?.size,
    name: sanitized.name || DEFAULT_ROOT_NAME,
    root: true,
    nodeMapId: mapId,
  }
}

export {
  mapClientNodeToMmpNode,
  mapClientBasicNodeToMmpRootNode,
  mapMmpMapToClient,
}
