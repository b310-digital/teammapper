import * as Y from 'yjs'
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpMap } from '../entities/mmpMap.entity'
import { arrowKey } from '@teammapper/shared'
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
  node.protected = false
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

/** The configured default colors, as the settings file names them. */
const COLOR_DEFAULTS = {
  node: { name: '#666666', background: '#f5f5f5', branch: '#546e7a' },
  root: { name: '#666666', background: '#eeeeee' },
}

const groupOf = (yNode: Y.Map<unknown>, key: string) =>
  (yNode.get(key) as Y.Map<unknown>).toJSON()

const yNodeToPlainObject = (yNode: Y.Map<unknown>) => ({
  id: yNode.get('id'),
  parent: yNode.get('parent'),
  name: yNode.get('name'),
  isRoot: yNode.get('isRoot'),
  protected: yNode.get('protected'),
  k: yNode.get('k'),
  coordinates: yNode.get('coordinates'),
  colors: groupOf(yNode, 'colors'),
  font: groupOf(yNode, 'font'),
  image: groupOf(yNode, 'image'),
  link: groupOf(yNode, 'link'),
})

// Sends every update `from` holds and `to` lacks
const sync = (from: Y.Doc, to: Y.Doc): void =>
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))

const populateAndGet = (
  node: MmpNode
): { yNode: Y.Map<unknown>; doc: Y.Doc } => {
  const doc = new Y.Doc()
  const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
  populateYMapFromNode(nodesMap, node, COLOR_DEFAULTS)
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
        protected: false,
        k: 1.5,
        coordinates: { x: 100, y: 200 },
        colors: { name: '#333333', background: '#ffffff', branch: '#999999' },
        font: { style: 'italic', size: 16, weight: 'bold' },
        image: { src: 'data:image/png;base64,iVBORw0KGgo=', size: 80 },
        link: { href: 'https://example.com' },
      })

      doc.destroy()
    })

    it('writes no detached entry', () => {
      const { yNode, doc } = populateAndGet(createTestNode())

      expect(yNode.has('detached')).toBe(false)

      doc.destroy()
    })

    it('round-trips the protected flag', () => {
      const { yNode, doc } = populateAndGet(createTestNode({ protected: true }))

      expect(yNode.get('protected')).toBe(true)
      expect(yMapToMmpNode('node-1', yNode, 'map-1').protected).toBe(true)

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
          k: null,
        })
      )

      expect(yNodeToPlainObject(yNode)).toMatchObject({
        name: '',
        protected: false,
        k: 1,
        colors: { name: '', background: '', branch: '' },
        font: { style: '', size: 12, weight: '' },
        image: { src: '', size: 0 },
        link: { href: '' },
      })

      doc.destroy()
    })

    it('stores each attribute group as a nested Y.Map', () => {
      const { yNode, doc } = populateAndGet(createTestNode())

      expect(
        ['colors', 'font', 'image', 'link'].map(
          (key) => yNode.get(key) instanceof Y.Map
        )
      ).toEqual([true, true, true, true])

      doc.destroy()
    })

    it('merges concurrent edits of different attributes in one group', () => {
      const { doc } = populateAndGet(createTestNode())
      const [first, second] = [new Y.Doc(), new Y.Doc()]
      sync(doc, first)
      sync(doc, second)
      const colorsIn = (client: Y.Doc) =>
        (client.getMap('nodes').get('node-1') as Y.Map<unknown>).get(
          'colors'
        ) as Y.Map<unknown>

      colorsIn(first).set('background', '#ff0000')
      colorsIn(second).set('name', '#00ff00')
      sync(first, doc)
      sync(second, doc)

      const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
      expect(
        yMapToMmpNode('node-1', nodesMap.get('node-1')!, 'map-1')
      ).toMatchObject({
        colorsBackground: '#ff0000',
        colorsName: '#00ff00',
        colorsBranch: '#999999',
      })

      ;[doc, first, second].forEach((d) => d.destroy())
    })
  })

  describe('yMapToMmpNode', () => {
    it('reads attribute groups a client stored as plain objects', () => {
      const { yNode, doc } = populateAndGet(createTestNode())
      doc.transact(() => {
        yNode.set('colors', { name: '#111111', background: '', branch: '' })
        yNode.set('font', { style: 'normal', size: 20, weight: 'normal' })
        yNode.set('image', { src: '', size: 0 })
        yNode.set('link', { href: 'https://example.org' })
      })

      expect(yMapToMmpNode('node-1', yNode, 'map-1')).toMatchObject({
        colorsName: '#111111',
        fontSize: 20,
        imageSize: 0,
        linkHref: 'https://example.org',
      })

      doc.destroy()
    })

    it('converts Y.Map back to MmpNode with all fields', () => {
      const { yNode, doc } = populateAndGet(createTestNode())

      expect(yMapToMmpNode('node-1', yNode, 'map-1')).toMatchObject({
        id: 'node-1',
        name: 'Test Node',
        root: true,
        protected: false,
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

    it('takes the id from the key, not from the id field', () => {
      const { yNode, doc } = populateAndGet(createTestNode())
      yNode.set('id', 'other-node')

      expect(yMapToMmpNode('node-1', yNode, 'map-1').id).toBe('node-1')

      doc.destroy()
    })

    it('takes the id from the key when the id field is missing', () => {
      const { yNode, doc } = populateAndGet(createTestNode())
      yNode.delete('id')

      expect(yMapToMmpNode('node-1', yNode, 'map-1').id).toBe('node-1')

      doc.destroy()
    })

    it('sets nodeParentId to undefined for null parent', () => {
      const { yNode, doc } = populateAndGet(
        createTestNode({ nodeParentId: null })
      )

      expect(
        yMapToMmpNode('node-1', yNode, 'map-1').nodeParentId
      ).toBeUndefined()

      doc.destroy()
    })

    it('sets nodeParentId to undefined for an empty string parent, as an older client writes it', () => {
      const { yNode, doc } = populateAndGet(
        createTestNode({ nodeParentId: null })
      )
      yNode.set('parent', '')

      expect(
        yMapToMmpNode('node-1', yNode, 'map-1').nodeParentId
      ).toBeUndefined()

      doc.destroy()
    })

    it('preserves non-null nodeParentId', () => {
      const { yNode, doc } = populateAndGet(
        createTestNode({ nodeParentId: 'parent-id', root: false })
      )

      expect(yMapToMmpNode('node-1', yNode, 'map-1').nodeParentId).toBe(
        'parent-id'
      )

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

    it('falls back to a max font size of 48 when none is stored', () => {
      const doc = new Y.Doc()
      const optionsMap = doc.getMap('mapOptions') as Y.Map<unknown>

      expect(yMapToMapOptions(optionsMap).options.fontMaxSize).toBe(48)

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
        createTestMap(),
        [],
        COLOR_DEFAULTS
      )

      expect((doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).size).toBe(2)

      doc.destroy()
    })

    it('handles an empty node list', () => {
      const doc = new Y.Doc()
      hydrateYDoc(doc, [], createTestMap(), [], COLOR_DEFAULTS)

      expect((doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).size).toBe(0)

      doc.destroy()
    })

    it('fills the arrows map keyed by arrowKey with source and target', () => {
      const doc = new Y.Doc()
      hydrateYDoc(
        doc,
        [],
        createTestMap(),
        [{ source: 'node-1', target: 'node-2' }],
        COLOR_DEFAULTS
      )

      const arrows = doc.getMap('arrows') as Y.Map<Y.Map<unknown>>
      expect(Array.from(arrows.keys())).toEqual([arrowKey('node-1', 'node-2')])
      expect(arrows.get('node-1:node-2')?.toJSON()).toEqual({
        source: 'node-1',
        target: 'node-2',
      })

      doc.destroy()
    })

    it('gives an empty arrows map when the map has no arrows', () => {
      const doc = new Y.Doc()
      hydrateYDoc(doc, [createTestNode()], createTestMap(), [], COLOR_DEFAULTS)

      expect((doc.getMap('arrows') as Y.Map<Y.Map<unknown>>).size).toBe(0)

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
        createTestMap(),
        [{ source: 'node-1', target: 'node-2' }],
        COLOR_DEFAULTS
      )

      expect(updateCount).toBe(1)

      doc.destroy()
    })
  })

  describe('node images', () => {
    it.each([
      ['a reference', 'image:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
      ['a data URL', 'data:image/png;base64,iVBORw0KGgo='],
    ])('keeps %s unchanged through hydrate and persist', (_label, src) => {
      const doc = new Y.Doc()
      hydrateYDoc(
        doc,
        [createTestNode({ imageSrc: src })],
        createTestMap(),
        [],
        COLOR_DEFAULTS
      )
      const yNode = (doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).get(
        'node-1'
      )!

      expect(groupOf(yNode, 'image')).toEqual({ src, size: 80 })
      expect(yMapToMmpNode('node-1', yNode, 'map-1').imageSrc).toBe(src)

      doc.destroy()
    })
  })

  // Releases before March 2026 stored the rgba() colors the color picker
  // wrote. The map accepts hex colors only, so hydration replaces them.
  describe('stored colors that are no hex colors', () => {
    const hydratedColors = (node: MmpNode) => {
      const doc = new Y.Doc()
      hydrateYDoc(doc, [node], createTestMap(), [], COLOR_DEFAULTS)
      const nodes = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
      const yNode = nodes.get(node.id)
      if (!yNode) throw new Error('hydration wrote no node')
      return groupOf(yNode, 'colors')
    }

    it('hydrates them as the default colors of a child node', () => {
      const colors = hydratedColors(
        createTestNode({
          nodeParentId: 'root-1',
          root: false,
          colorsName: 'red',
          colorsBackground: 'rgba(139,195,74,0.44)',
          colorsBranch: 'rgb(1,2,3)',
        })
      )

      expect(colors).toEqual(COLOR_DEFAULTS.node)
    })

    it('hydrates them as the default colors of a root node', () => {
      const colors = hydratedColors(
        createTestNode({
          colorsBackground: 'rgba(139,195,74,0.44)',
          colorsBranch: 'rgba(0,0,0,0.5)',
        })
      )

      expect(colors).toEqual({
        name: '#333333',
        background: '#eeeeee',
        branch: '',
      })
    })

    // An override file can configure a default the map rejects as well.
    it('hydrates them as no color when the configured default is no hex color', () => {
      const doc = new Y.Doc()
      const node = createTestNode({ colorsBackground: 'rgba(0,0,0,0.5)' })
      const defaults = {
        node: COLOR_DEFAULTS.node,
        root: { background: 'rgb(245,245,245)' },
      }

      hydrateYDoc(doc, [node], createTestMap(), [], defaults)

      const yNode = (doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).get(node.id)
      if (!yNode) throw new Error('hydration wrote no node')
      expect(groupOf(yNode, 'colors').background).toBe('')
    })

    it('keeps hex colors and empty colors', () => {
      const colors = hydratedColors(
        createTestNode({
          colorsName: '#f00',
          colorsBackground: '#8bc34a70',
          colorsBranch: '',
        })
      )

      expect(colors).toEqual({
        name: '#f00',
        background: '#8bc34a70',
        branch: '',
      })
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
        yNode.set('protected', false)
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
      const result = yMapToMmpNode('node-xss', yNode, 'map-1')

      expect(result.name).toBe('Hello')
      expect(result.imageSrc).toBe('')
      expect(result.linkHref).toBe('')

      doc.destroy()
    })
  })
})
