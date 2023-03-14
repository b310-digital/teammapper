import { MmpMap } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { IMmpClientMap, IMmpClientNode, IMmpClientNodeBasics } from '../types';

const mapMmpNodeToClient = (serverNode: MmpNode): IMmpClientNode => ({
  colors: {
    name: serverNode.colorsName || '',
    background: serverNode.colorsBackground || '',
    branch: serverNode.colorsBranch || '',
  },
  coordinates: { x: serverNode.coordinatesX || 0, y: serverNode.coordinatesY || 0 },
  font: {
    style: serverNode.fontStyle || '',
    size: serverNode.fontSize || 12,
    weight: serverNode.fontWeight || '',
  },
  link: {
    href: serverNode.linkHref || ''
  },
  id: serverNode.id,
  image: { src: serverNode.imageSrc || '', size: serverNode.imageSize || 0 },
  k: serverNode.k || 1,
  locked: serverNode.locked || false,
  name: serverNode.name || '',
  parent: serverNode.nodeParentId || '',
  isRoot: serverNode.root || false,
});

const mapMmpMapToClient = (serverMap: MmpMap, serverNodes: MmpNode[], deletedAt: Date, deleteAfterDays: number): IMmpClientMap => {
  return {
    uuid: serverMap.id,
    data: serverNodes.map((node) => mapMmpNodeToClient(node)),
    deleteAfterDays,
    deletedAt,
    lastModified: serverMap.lastModified,
    options: serverMap?.options
  }
};

const mapClientNodeToMmpNode = (clientNode: IMmpClientNode, mapId: string): Object => ({
  id: clientNode.id,
  colorsBackground: clientNode.colors.background,
  colorsBranch: clientNode.colors.branch,
  colorsName: clientNode.colors.name,
  coordinatesX: clientNode.coordinates.x,
  coordinatesY: clientNode.coordinates.y,
  fontSize: clientNode.font.size,
  fontStyle: clientNode.font.style,
  fontWeight: clientNode.font.weight,
  imageSrc: clientNode.image?.src,
  imageSize: clientNode.image?.size,
  k: clientNode.k,
  linkHref: clientNode.link?.href,
  locked: clientNode.locked,
  name: clientNode.name,
  nodeParentId: clientNode.parent ? clientNode.parent : null,
  root: clientNode.isRoot,
  nodeMapId: mapId,
});

// Maps and enhances given properties to a valid root node
const mapClientBasicNodeToMmpRootNode = (clientRootNodeBasics: IMmpClientNodeBasics, mapId: string): Object => ({
  colorsBackground: clientRootNodeBasics.colors.background || '#f0f6f5',
  colorsBranch: clientRootNodeBasics.colors.branch,
  colorsName: clientRootNodeBasics.colors.name || '#787878',
  coordinatesX: 0,
  coordinatesY: 0,
  fontSize: clientRootNodeBasics.font.size || 20,
  fontStyle: clientRootNodeBasics.font.style || 'normal',
  fontWeight: clientRootNodeBasics.font.weight || 'normal',
  imageSrc: clientRootNodeBasics.image?.src,
  imageSize: clientRootNodeBasics.image?.size,
  name: clientRootNodeBasics.name || 'Root node',
  nodeParentId: null,
  root: true,
  nodeMapId: mapId,
});

export { mapMmpNodeToClient, mapClientNodeToMmpNode, mapClientBasicNodeToMmpRootNode, mapMmpMapToClient };
