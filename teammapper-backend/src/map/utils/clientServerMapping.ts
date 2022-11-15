import { MmpMap, mmpMapOptionDefaults } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { IMmpClientMap, IMmpClientNode } from '../types';

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
  id: serverNode.id,
  image: { src: serverNode.imageSrc || '', size: serverNode.imageSize || 0 },
  k: serverNode.k || 1,
  locked: serverNode.locked || false,
  name: serverNode.name || '',
  parent: serverNode.nodeParentId || '',
  isRoot: serverNode.root || false,
});

const mapMmpMapToClient = (serverMap: MmpMap, serverNodes: MmpNode[], deletedAt: Date, deleteAfterDays: number): IMmpClientMap => {
  const options = serverMap?.options || mmpMapOptionDefaults
  return {
    uuid: serverMap.id,
    data: serverNodes.map((node) => mapMmpNodeToClient(node)),
    deleteAfterDays,
    deletedAt,
    lastModified: serverMap.lastModified,
    options: { fontMaxSize: options?.fontMaxSize, fontMinSize: options?.fontMinSize, fontIncrement: options?.fontIncrement }
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
  locked: clientNode.locked,
  name: clientNode.name,
  nodeParentId: clientNode.parent ? clientNode.parent : null,
  root: clientNode.isRoot,
  nodeMapId: mapId,
});

export { mapMmpNodeToClient, mapClientNodeToMmpNode, mapMmpMapToClient };
