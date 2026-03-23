import {
  mapClientNodeToMmpNode,
  mergeClientNodeIntoMmpNode,
  mapClientBasicNodeToMmpRootNode,
} from './clientServerMapping'
import { MmpNode } from '../entities/mmpNode.entity'
import { IMmpClientNode } from '../types'

const buildClientNode = (
  overrides: Partial<IMmpClientNode> = {}
): IMmpClientNode => ({
  id: 'test-uuid',
  name: 'Test Node',
  colors: { name: '#000000', background: '#ffffff', branch: '#333333' },
  coordinates: { x: 0, y: 0 },
  font: { style: 'normal', size: 20, weight: 'normal' },
  image: { src: '', size: 0 },
  link: { href: '' },
  k: 1,
  locked: false,
  detached: false,
  isRoot: false,
  parent: 'parent-uuid',
  ...overrides,
})

const buildServerNode = (overrides: Partial<MmpNode> = {}): MmpNode => {
  const node = new MmpNode()
  Object.assign(node, {
    id: 'server-uuid',
    name: 'Server Node',
    colorsName: '#000000',
    colorsBackground: '#ffffff',
    colorsBranch: '#333333',
    coordinatesX: 0,
    coordinatesY: 0,
    fontSize: 20,
    fontStyle: 'normal',
    fontWeight: 'normal',
    imageSrc: '',
    imageSize: 0,
    linkHref: '',
    k: 1,
    locked: false,
    detached: false,
    root: false,
    nodeMapId: 'map-uuid',
    nodeParentId: 'parent-uuid',
    ...overrides,
  })
  return node
}

describe('mapClientNodeToMmpNode sanitization', () => {
  it('should strip HTML from name', () => {
    const client = buildClientNode({
      name: '<img src=x onerror=alert(1)>Hello',
    })
    const result = mapClientNodeToMmpNode(client, 'map-id')
    expect(result.name).toBe('Hello')
  })

  it('should reject SVG image source', () => {
    const client = buildClientNode({
      image: { src: 'data:image/svg+xml;base64,PHN2Zz4=', size: 60 },
    })
    const result = mapClientNodeToMmpNode(client, 'map-id')
    expect(result.imageSrc).toBe('')
  })

  it('should reject javascript link href', () => {
    const client = buildClientNode({
      link: { href: 'javascript:alert(1)' },
    })
    const result = mapClientNodeToMmpNode(client, 'map-id')
    expect(result.linkHref).toBe('')
  })

  it('should accept valid https link', () => {
    const client = buildClientNode({
      link: { href: 'https://example.com' },
    })
    const result = mapClientNodeToMmpNode(client, 'map-id')
    expect(result.linkHref).toBe('https://example.com')
  })

  it('should reject HTML injection in color field', () => {
    const client = buildClientNode({
      colors: {
        name: '<script>alert(1)</script>',
        background: '#fff',
        branch: '#000',
      },
    })
    const result = mapClientNodeToMmpNode(client, 'map-id')
    expect(result.colorsName).toBe('')
  })

  it('should reject invalid font style', () => {
    const client = buildClientNode({
      font: { style: 'expression(alert(1))', size: 20, weight: 'normal' },
    })
    const result = mapClientNodeToMmpNode(client, 'map-id')
    expect(result.fontStyle).toBe('normal')
  })
})

describe('mergeClientNodeIntoMmpNode sanitization', () => {
  it('should sanitize name when client provides it', () => {
    const client = { name: '<script>xss</script>Clean' }
    const server = buildServerNode()
    const result = mergeClientNodeIntoMmpNode(client, server)
    expect(result.name).toBe('Clean')
  })

  it('should keep server name when client does not provide it', () => {
    const server = buildServerNode({ name: 'Server Name' })
    const result = mergeClientNodeIntoMmpNode({}, server)
    expect(result.name).toBe('Server Name')
  })

  it('should sanitize image src when client provides it', () => {
    const client = { image: { src: 'javascript:alert(1)', size: 60 } }
    const server = buildServerNode()
    const result = mergeClientNodeIntoMmpNode(client, server)
    expect(result.imageSrc).toBe('')
  })

  it('should sanitize link href when client provides it', () => {
    const client = {
      link: { href: 'data:text/html,<script>alert(1)</script>' },
    }
    const server = buildServerNode()
    const result = mergeClientNodeIntoMmpNode(client, server)
    expect(result.linkHref).toBe('')
  })
})

describe('mapClientBasicNodeToMmpRootNode sanitization', () => {
  it('should sanitize name with HTML', () => {
    const basics = {
      name: '<b>Root</b>',
      colors: { name: '#000000', background: '#ffffff', branch: '#333333' },
      font: { style: 'normal', size: 20, weight: 'normal' },
      image: { src: '', size: 0 },
    }
    const result = mapClientBasicNodeToMmpRootNode(basics, 'map-id')
    expect(result.name).toBe('Root')
  })

  it('should reject SVG in image src', () => {
    const basics = {
      name: 'Root',
      colors: { name: '#000000', background: '#ffffff', branch: '#333333' },
      font: { style: 'normal', size: 20, weight: 'normal' },
      image: { src: 'data:image/svg+xml;base64,PHN2Zz4=', size: 60 },
    }
    const result = mapClientBasicNodeToMmpRootNode(basics, 'map-id')
    expect(result.imageSrc).toBe('')
  })
})
