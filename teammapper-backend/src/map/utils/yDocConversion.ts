import * as Y from 'yjs'
import { MmpNode } from '../entities/mmpNode.entity'
import { MapOptions } from '../types'
import { MmpMap } from '../entities/mmpMap.entity'

// Converts an MmpNode entity to a Y.Map and sets it in the nodes container
export const populateYMapFromNode = (
  nodesMap: Y.Map<Y.Map<unknown>>,
  node: MmpNode
): void => {
  const yNode = new Y.Map<unknown>()
  yNode.set('id', node.id)
  yNode.set('parent', node.nodeParentId ?? null)
  yNode.set('name', node.name ?? '')
  yNode.set('isRoot', node.root ?? false)
  yNode.set('locked', node.locked ?? false)
  yNode.set('detached', node.detached ?? false)
  yNode.set('k', node.k ?? 1)
  yNode.set('coordinates', {
    x: node.coordinatesX ?? 0,
    y: node.coordinatesY ?? 0,
  })
  yNode.set('colors', {
    name: node.colorsName ?? '',
    background: node.colorsBackground ?? '',
    branch: node.colorsBranch ?? '',
  })
  yNode.set('font', {
    style: node.fontStyle ?? '',
    size: node.fontSize ?? 12,
    weight: node.fontWeight ?? '',
  })
  yNode.set('image', {
    src: node.imageSrc ?? '',
    size: node.imageSize ?? 0,
  })
  yNode.set('link', { href: node.linkHref ?? '' })
  yNode.set('orderNumber', node.orderNumber ?? 0)
  nodesMap.set(node.id, yNode)
}

// Converts a Y.Map entry back to a partial MmpNode for persistence
export const yMapToMmpNode = (
  yNode: Y.Map<unknown>,
  mapId: string
): Partial<MmpNode> => {
  const coords = yNode.get('coordinates') as
    | { x: number; y: number }
    | undefined
  const colors = yNode.get('colors') as
    | {
        name: string
        background: string
        branch: string
      }
    | undefined
  const font = yNode.get('font') as
    | {
        style: string
        size: number
        weight: string
      }
    | undefined
  const image = yNode.get('image') as
    | {
        src: string
        size: number
      }
    | undefined
  const link = yNode.get('link') as { href: string } | undefined
  const parent = yNode.get('parent') as string | null | undefined

  return {
    id: yNode.get('id') as string,
    nodeParentId: parent || undefined,
    name: (yNode.get('name') as string) ?? '',
    root: (yNode.get('isRoot') as boolean) ?? false,
    locked: (yNode.get('locked') as boolean) ?? false,
    detached: (yNode.get('detached') as boolean) ?? false,
    k: (yNode.get('k') as number) ?? 1,
    coordinatesX: coords?.x ?? 0,
    coordinatesY: coords?.y ?? 0,
    colorsName: colors?.name ?? '',
    colorsBackground: colors?.background ?? '',
    colorsBranch: colors?.branch ?? '',
    fontStyle: font?.style ?? '',
    fontSize: font?.size ?? 12,
    fontWeight: font?.weight ?? '',
    imageSrc: image?.src ?? '',
    imageSize: image?.size ?? 0,
    linkHref: link?.href ?? '',
    orderNumber: (yNode.get('orderNumber') as number) ?? undefined,
    nodeMapId: mapId,
  }
}

// Populates the mapOptions Y.Map from an MmpMap entity
export const populateYMapFromMapOptions = (
  optionsMap: Y.Map<unknown>,
  map: MmpMap
): void => {
  optionsMap.set('name', map.name ?? '')
  if (map.options) {
    optionsMap.set('fontMaxSize', map.options.fontMaxSize)
    optionsMap.set('fontMinSize', map.options.fontMinSize)
    optionsMap.set('fontIncrement', map.options.fontIncrement)
  }
}

// Extracts map options from the mapOptions Y.Map
export const yMapToMapOptions = (
  optionsMap: Y.Map<unknown>
): { name: string | null; options: MapOptions } => {
  return {
    name: (optionsMap.get('name') as string) || null,
    options: {
      fontMaxSize: (optionsMap.get('fontMaxSize') as number) ?? 28,
      fontMinSize: (optionsMap.get('fontMinSize') as number) ?? 6,
      fontIncrement: (optionsMap.get('fontIncrement') as number) ?? 2,
    },
  }
}

// Hydrates a Y.Doc from database entities
export const hydrateYDoc = (
  doc: Y.Doc,
  nodes: MmpNode[],
  map: MmpMap
): void => {
  doc.transact(() => {
    const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
    for (const node of nodes) {
      populateYMapFromNode(nodesMap, node)
    }
    const optionsMap = doc.getMap('mapOptions') as Y.Map<unknown>
    populateYMapFromMapOptions(optionsMap, map)
  })
}
