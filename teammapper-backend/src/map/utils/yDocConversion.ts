import * as Y from 'yjs'
import { MmpNode } from '../entities/mmpNode.entity'
import { DEFAULT_FONT_MAX_SIZE, MapOptions } from '@teammapper/shared'
import { MmpMap } from '../entities/mmpMap.entity'
import { sanitizeNodeFields } from './sanitization'

// Builds the nested Y.Map that stores an attribute group, such as `colors`
// (see the glossary)
const attributeGroup = (attributes: Record<string, unknown>): Y.Map<unknown> =>
  new Y.Map(Object.entries(attributes))

// Reads an attribute group as a plain object. A peer with write access can
// store a plain object under the key instead of a nested Y.Map, and the
// reader returns that object unchanged.
const readAttributeGroup = <T>(
  yNode: Y.Map<unknown>,
  key: string
): T | undefined => {
  const value = yNode.get(key)
  return (value instanceof Y.Map ? value.toJSON() : value) as T | undefined
}

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
  yNode.set('protected', node.protected ?? false)
  yNode.set('k', node.k ?? 1)
  yNode.set('coordinates', {
    x: node.coordinatesX ?? 0,
    y: node.coordinatesY ?? 0,
  })
  yNode.set(
    'colors',
    attributeGroup({
      name: node.colorsName ?? '',
      background: node.colorsBackground ?? '',
      branch: node.colorsBranch ?? '',
    })
  )
  yNode.set(
    'font',
    attributeGroup({
      style: node.fontStyle ?? '',
      size: node.fontSize ?? 12,
      weight: node.fontWeight ?? '',
    })
  )
  yNode.set(
    'image',
    attributeGroup({
      src: node.imageSrc ?? '',
      size: node.imageSize ?? 0,
    })
  )
  yNode.set('link', attributeGroup({ href: node.linkHref ?? '' }))
  yNode.set('orderNumber', node.orderNumber ?? 0)
  nodesMap.set(node.id, yNode)
}

// Converts a Y.Map entry back to a partial MmpNode for persistence. The id is
// the entry's key in the nodes map, as on the client, never the `id` field.
export const yMapToMmpNode = (
  id: string,
  yNode: Y.Map<unknown>,
  mapId: string
): Partial<MmpNode> => {
  const coords = yNode.get('coordinates') as
    { x: number; y: number } | undefined
  const colors = readAttributeGroup<{
    name: string
    background: string
    branch: string
  }>(yNode, 'colors')
  const font = readAttributeGroup<{
    style: string
    size: number
    weight: string
  }>(yNode, 'font')
  const image = readAttributeGroup<{ src: string; size: number }>(
    yNode,
    'image'
  )
  const link = readAttributeGroup<{ href: string }>(yNode, 'link')
  const parent = yNode.get('parent') as string | null | undefined

  return sanitizeNodeFields({
    id,
    nodeParentId: parent || undefined,
    name: (yNode.get('name') as string) ?? '',
    root: (yNode.get('isRoot') as boolean) ?? false,
    protected: (yNode.get('protected') as boolean) ?? false,
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
  })
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
      fontMaxSize:
        (optionsMap.get('fontMaxSize') as number) ?? DEFAULT_FONT_MAX_SIZE,
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
