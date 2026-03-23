import * as Y from 'yjs'
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpMap } from '../entities/mmpMap.entity'
import {
  populateYMapFromNode,
  yMapToMmpNode,
  populateYMapFromMapOptions,
  yMapToMapOptions,
  hydrateYDoc,
} from './yDocConversion'

const createTestNode = (overrides: Partial<MmpNode> = {}): MmpNode => {
  const node = new MmpNode()
  node.id = 'node-1'
  node.nodeMapId = 'map-1'
  node.nodeParentId = null
  node.name = 'Test Node'
  node.root = true
  node.locked = false
  node.detached = false
  node.k = 1.5
  node.coordinatesX = 100
  node.coordinatesY = 200
  node.colorsName = '#333333'
  node.colorsBackground = '#ffffff'
  node.colorsBranch = '#999999'
  node.fontStyle = 'italic'
  node.fontSize = 16
  node.fontWeight = 'bold'
  node.imageSrc = 'data:image/png;base64,iVBORw0KGgo='
  node.imageSize = 80
  node.linkHref = 'https://example.com'
  node.orderNumber = 1
  node.lastModified = new Date()
  node.createdAt = new Date()
  Object.assign(node, overrides)
  return node
}

const createTestMap = (overrides: Partial<MmpMap> = {}): MmpMap => {
  const map = new MmpMap()
  map.id = 'map-1'
  map.name = 'Test Map'
  map.options = { fontMaxSize: 28, fontMinSize: 6, fontIncrement: 2 }
  map.lastModified = new Date()
  map.lastAccessed = new Date()
  map.createdAt = new Date()
  Object.assign(map, overrides)
  return map
}

const yNodeToPlainObject = (yNode: Y.Map<unknown>) => ({
  id: yNode.get('id'),
  parent: yNode.get('parent'),
  name: yNode.get('name'),
  isRoot: yNode.get('isRoot'),
  locked: yNode.get('locked'),
  detached: yNode.get('detached'),
  k: yNode.get('k'),
  coordinates: yNode.get('coordinates'),
  colors: yNode.get('colors'),
  font: yNode.get('font'),
  image: yNode.get('image'),
  link: yNode.get('link'),
})

const populateAndGet = (
  node: MmpNode
): { yNode: Y.Map<unknown>; doc: Y.Doc } => {
  const doc = new Y.Doc()
  const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
  populateYMapFromNode(nodesMap, node)
  return { yNode: nodesMap.get(node.id)!, doc }
}

describe('yDocConversion', () => {
  describe('populateYMapFromNode', () => {
    it('populates a Y.Map with all node fields', () => {
      const { yNode, doc } = populateAndGet(createTestNode())

      expect(yNodeToPlainObject(yNode)).toEqual({
        id: 'node-1',
        parent: null,
        name: 'Test Node',
        isRoot: true,
        locked: false,
        detached: false,
        k: 1.5,
        coordinates: { x: 100, y: 200 },
        colors: { name: '#333333', background: '#ffffff', branch: '#999999' },
        font: { style: 'italic', size: 16, weight: 'bold' },
        image: { src: 'data:image/png;base64,iVBORw0KGgo=', size: 80 },
        link: { href: 'https://example.com' },
      })

      doc.destroy()
    })

    it('defaults nullable fields to safe values', () => {
      const { yNode, doc } = populateAndGet(
        createTestNode({
          name: null,
          colorsName: null,
          colorsBackground: null,
          colorsBranch: null,
          fontStyle: null,
          fontSize: null,
          fontWeight: null,
          imageSrc: null,
          imageSize: null,
          linkHref: null,
          locked: null,
          k: null,
        })
      )

      expect(yNodeToPlainObject(yNode)).toMatchObject({
        name: '',
        locked: false,
        k: 1,
        colors: { name: '', background: '', branch: '' },
        font: { style: '', size: 12, weight: '' },
        image: { src: '', size: 0 },
        link: { href: '' },
      })

      doc.destroy()
    })
  })

  describe('yMapToMmpNode', () => {
    it('converts Y.Map back to MmpNode with all fields', () => {
      const { yNode, doc } = populateAndGet(createTestNode())

      expect(yMapToMmpNode(yNode, 'map-1')).toMatchObject({
        id: 'node-1',
        name: 'Test Node',
        root: true,
        locked: false,
        detached: false,
        k: 1.5,
        coordinatesX: 100,
        coordinatesY: 200,
        colorsName: '#333333',
        colorsBackground: '#ffffff',
        colorsBranch: '#999999',
        fontStyle: 'italic',
        fontSize: 16,
        fontWeight: 'bold',
        imageSrc: 'data:image/png;base64,iVBORw0KGgo=',
        imageSize: 80,
        linkHref: 'https://example.com',
        nodeMapId: 'map-1',
      })

      doc.destroy()
    })

    it('sets nodeParentId to undefined for null parent', () => {
      const { yNode, doc } = populateAndGet(
        createTestNode({ nodeParentId: null })
      )

      expect(yMapToMmpNode(yNode, 'map-1').nodeParentId).toBeUndefined()

      doc.destroy()
    })

    it('preserves non-null nodeParentId', () => {
      const { yNode, doc } = populateAndGet(
        createTestNode({ nodeParentId: 'parent-id', root: false })
      )

      expect(yMapToMmpNode(yNode, 'map-1').nodeParentId).toBe('parent-id')

      doc.destroy()
    })
  })

  describe('populateYMapFromMapOptions / yMapToMapOptions roundtrip', () => {
    it('round-trips map name and options', () => {
      const doc = new Y.Doc()
      const optionsMap = doc.getMap('mapOptions') as Y.Map<unknown>
      populateYMapFromMapOptions(optionsMap, createTestMap())

      expect(yMapToMapOptions(optionsMap)).toEqual({
        name: 'Test Map',
        options: { fontMaxSize: 28, fontMinSize: 6, fontIncrement: 2 },
      })

      doc.destroy()
    })

    it('converts empty name to null on readback', () => {
      const doc = new Y.Doc()
      const optionsMap = doc.getMap('mapOptions') as Y.Map<unknown>
      populateYMapFromMapOptions(optionsMap, createTestMap({ name: null }))

      expect(yMapToMapOptions(optionsMap).name).toBeNull()

      doc.destroy()
    })
  })

  describe('hydrateYDoc', () => {
    it('populates all nodes into the nodes map', () => {
      const doc = new Y.Doc()
      hydrateYDoc(
        doc,
        [
          createTestNode(),
          createTestNode({ id: 'node-2', root: false, name: 'Child' }),
        ],
        createTestMap()
      )

      expect((doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).size).toBe(2)

      doc.destroy()
    })

    it('handles an empty node list', () => {
      const doc = new Y.Doc()
      hydrateYDoc(doc, [], createTestMap())

      expect((doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).size).toBe(0)

      doc.destroy()
    })

    it('executes all writes within a single transaction', () => {
      const doc = new Y.Doc()
      let updateCount = 0
      doc.on('update', () => {
        updateCount++
      })

      hydrateYDoc(
        doc,
        [createTestNode(), createTestNode({ id: 'node-2', root: false })],
        createTestMap()
      )

      expect(updateCount).toBe(1)

      doc.destroy()
    })
  })

  describe('yMapToMmpNode sanitization', () => {
    it('should sanitize malicious fields from Y.Map data', () => {
      const doc = new Y.Doc()
      const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>

      doc.transact(() => {
        const yNode = new Y.Map<unknown>()
        yNode.set('id', 'node-xss')
        yNode.set('parent', null)
        yNode.set('name', '<img src=x onerror=alert(1)>Hello')
        yNode.set('isRoot', true)
        yNode.set('locked', false)
        yNode.set('detached', false)
        yNode.set('k', 1)
        yNode.set('coordinates', { x: 0, y: 0 })
        yNode.set('colors', {
          name: '#000000',
          background: '#ffffff',
          branch: '#333333',
        })
        yNode.set('font', { style: 'normal', size: 14, weight: 'normal' })
        yNode.set('image', {
          src: 'data:image/svg+xml;base64,PHN2Zz4=',
          size: 60,
        })
        yNode.set('link', { href: 'javascript:alert(1)' })
        yNode.set('orderNumber', 1)
        nodesMap.set('node-xss', yNode)
      })

      const yNode = nodesMap.get('node-xss')!
      const result = yMapToMmpNode(yNode, 'map-1')

      expect(result.name).toBe('Hello')
      expect(result.imageSrc).toBe('')
      expect(result.linkHref).toBe('')

      doc.destroy()
    })
  })
})
