import { Logger } from '@nestjs/common'
import { jest } from '@jest/globals'
import { MmpNode } from '../entities/mmpNode.entity'
import { orderNodesFromRoot } from './nodeOrdering'

const makeNode = (overrides: Partial<MmpNode>): Partial<MmpNode> => ({
  root: false,
  nodeParentId: null,
  ...overrides,
})

describe('orderNodesFromRoot', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('places root node first with orderNumber 1', () => {
    const nodes = [
      makeNode({ id: 'child', nodeParentId: 'root', root: false }),
      makeNode({ id: 'root', root: true }),
    ]

    const result = orderNodesFromRoot(nodes)

    expect(result[0]).toMatchObject({ id: 'root', orderNumber: 1 })
    expect(result[1]).toMatchObject({ id: 'child', orderNumber: 2 })
  })

  it('orders parents before children in a three-level tree', () => {
    const nodes = [
      makeNode({ id: 'grandchild', nodeParentId: 'child' }),
      makeNode({ id: 'child', nodeParentId: 'root' }),
      makeNode({ id: 'root', root: true }),
    ]

    const result = orderNodesFromRoot(nodes)
    const ids = result.map((n) => n.id)

    expect(ids).toEqual(['root', 'child', 'grandchild'])
    expect(result.map((n) => n.orderNumber)).toEqual([1, 2, 3])
  })

  it('handles multiple children of the same parent', () => {
    const nodes = [
      makeNode({ id: 'root', root: true }),
      makeNode({ id: 'b', nodeParentId: 'root' }),
      makeNode({ id: 'a', nodeParentId: 'root' }),
    ]

    const result = orderNodesFromRoot(nodes)

    expect(result[0].id).toBe('root')
    expect(result.map((n) => n.id)).toContain('a')
    expect(result.map((n) => n.id)).toContain('b')
  })

  it('handles a deep chain: root → A → B → C → D', () => {
    const nodes = [
      makeNode({ id: 'D', nodeParentId: 'C' }),
      makeNode({ id: 'B', nodeParentId: 'A' }),
      makeNode({ id: 'root', root: true }),
      makeNode({ id: 'C', nodeParentId: 'B' }),
      makeNode({ id: 'A', nodeParentId: 'root' }),
    ]

    const result = orderNodesFromRoot(nodes)
    const ids = result.map((n) => n.id)

    expect(ids).toEqual(['root', 'A', 'B', 'C', 'D'])
    expect(result.map((n) => n.orderNumber)).toEqual([1, 2, 3, 4, 5])
  })

  it('orders a second root after the main root and before its child', () => {
    const nodes = [
      makeNode({ id: 'secondChild', nodeParentId: 'second' }),
      makeNode({ id: 'second' }),
      makeNode({ id: 'main', root: true }),
    ]

    const result = orderNodesFromRoot(nodes)

    expect(result.map((n) => [n.id, n.orderNumber])).toEqual([
      ['main', 1],
      ['second', 2],
      ['secondChild', 3],
    ])
  })

  it('leaves out an orphan and its descendants', () => {
    const nodes = [
      makeNode({ id: 'orphanChild', nodeParentId: 'orphan' }),
      makeNode({ id: 'orphan', nodeParentId: 'deleted' }),
      makeNode({ id: 'child', nodeParentId: 'root' }),
      makeNode({ id: 'root', root: true }),
    ]

    const result = orderNodesFromRoot(nodes)

    expect(result.map((n) => [n.id, n.orderNumber])).toEqual([
      ['root', 1],
      ['child', 2],
    ])
  })

  it('leaves out the nodes of a parent cycle', () => {
    const nodes = [
      makeNode({ id: 'root', root: true }),
      makeNode({ id: 'a', nodeParentId: 'b' }),
      makeNode({ id: 'b', nodeParentId: 'a' }),
    ]

    expect(orderNodesFromRoot(nodes).map((n) => n.id)).toEqual(['root'])
  })

  it('logs the ids of the nodes it leaves out', () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => {})
    const nodes = [
      makeNode({ id: 'root', root: true }),
      makeNode({ id: 'orphan', nodeParentId: 'deleted' }),
    ]

    orderNodesFromRoot(nodes)

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('orphan'),
      'orderNodesFromRoot'
    )
  })

  it('leaves out every node when no root exists', () => {
    const nodes = [
      makeNode({ id: 'a', nodeParentId: 'x' }),
      makeNode({ id: 'b', nodeParentId: 'y' }),
    ]

    expect(orderNodesFromRoot(nodes)).toEqual([])
  })

  it('handles a single root node with no children', () => {
    const nodes = [makeNode({ id: 'root', root: true })]

    const result = orderNodesFromRoot(nodes)

    expect(result).toEqual([
      { id: 'root', root: true, nodeParentId: null, orderNumber: 1 },
    ])
  })

  it('does not mutate the input array', () => {
    const nodes = [
      makeNode({ id: 'child', nodeParentId: 'root' }),
      makeNode({ id: 'root', root: true }),
    ]
    const original = [...nodes]

    orderNodesFromRoot(nodes)

    expect(nodes).toEqual(original)
  })

  it('does not mutate the input node objects', () => {
    const root = makeNode({ id: 'root', root: true })
    const child = makeNode({ id: 'child', nodeParentId: 'root' })

    orderNodesFromRoot([child, root])

    expect(root).not.toHaveProperty('orderNumber')
    expect(child).not.toHaveProperty('orderNumber')
  })
})
