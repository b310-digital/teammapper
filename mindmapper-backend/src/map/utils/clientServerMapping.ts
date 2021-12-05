import { MmpMap } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { IMmpClientMap, IMmpClientNode } from '../types';

const mapMmpNodeToClient = (serverNode: MmpNode): IMmpClientNode => ({
  colors: {
    name: serverNode.colorsName,
    background: serverNode.colorsBackground,
    branch: serverNode.colorsBranch,
  },
  coordinates: { x: serverNode.coordinatesX, y: serverNode.coordinatesY },
  font: {
    style: serverNode.fontStyle,
    size: serverNode.fontSize,
    weight: serverNode.fontWeight,
  },
  id: serverNode.id,
  image: { src: serverNode.imageSrc, size: serverNode.imageSize },
  k: serverNode.k,
  locked: serverNode.locked,
  name: serverNode.name,
  parent: serverNode.nodeParentId || '',
  isRoot: serverNode.root,
});

const mapMmpMapToClient = (serverMap: MmpMap, serverNodes: MmpNode[]): IMmpClientMap => ({
  uuid: serverMap.id,
  data: serverNodes.map((node) => mapMmpNodeToClient(node)),
  lastModified: serverMap.lastModified,
});

const mapClientNodeToMmpNode = (clientNode: IMmpClientNode): Object => ({
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
});

export { mapMmpNodeToClient, mapClientNodeToMmpNode, mapMmpMapToClient };
