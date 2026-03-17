import { MmpNode } from '../entities/mmpNode.entity'
import {
  shouldValidateParent,
  createParentNotFoundWarning,
} from './nodeValidation'

describe('nodeValidation', () => {
  describe('shouldValidateParent', () => {
    it('returns true when nodeParentId is set and node is not root or detached', () => {
      const node: Partial<MmpNode> = {
        nodeParentId: 'parent-id',
        root: false,
        detached: false,
      }

      expect(shouldValidateParent(node)).toBe(true)
    })

    it('returns false when nodeParentId is not set', () => {
      const node: Partial<MmpNode> = {
        nodeParentId: undefined,
        root: false,
        detached: false,
      }

      expect(shouldValidateParent(node)).toBe(false)
    })

    it('returns false when node is root', () => {
      const node: Partial<MmpNode> = {
        nodeParentId: 'parent-id',
        root: true,
        detached: false,
      }

      expect(shouldValidateParent(node)).toBe(false)
    })

    it('returns false when node is detached', () => {
      const node: Partial<MmpNode> = {
        nodeParentId: 'parent-id',
        root: false,
        detached: true,
      }

      expect(shouldValidateParent(node)).toBe(false)
    })

    it('returns false when node is both root and detached', () => {
      const node: Partial<MmpNode> = {
        nodeParentId: 'parent-id',
        root: true,
        detached: true,
      }

      expect(shouldValidateParent(node)).toBe(false)
    })

    it('returns false when nodeParentId is null', () => {
      const node: Partial<MmpNode> = {
        nodeParentId: null as unknown as string,
        root: false,
        detached: false,
      }

      expect(shouldValidateParent(node)).toBe(false)
    })

    it('returns false when nodeParentId is empty string', () => {
      const node: Partial<MmpNode> = {
        nodeParentId: '',
        root: false,
        detached: false,
      }

      expect(shouldValidateParent(node)).toBe(false)
    })
  })

  describe('createParentNotFoundWarning', () => {
    it('creates a properly formatted warning message', () => {
      const warning = createParentNotFoundWarning(
        'node-123',
        'parent-456',
        'map-789',
        'updateNode()'
      )

      expect(warning).toBe(
        'updateNode(): Cannot update node node-123 - parent parent-456 does not exist in map map-789'
      )
    })

    it('includes the context at the beginning of the message', () => {
      const warning = createParentNotFoundWarning(
        'node-abc',
        'parent-def',
        'map-ghi',
        'diffUpdatedCallback()'
      )

      expect(warning).toContain('diffUpdatedCallback():')
    })

    it('includes all provided IDs in the message', () => {
      const nodeId = 'node-test-1'
      const parentId = 'parent-test-2'
      const mapId = 'map-test-3'

      const warning = createParentNotFoundWarning(
        nodeId,
        parentId,
        mapId,
        'testContext()'
      )

      expect(warning).toContain(nodeId)
      expect(warning).toContain(parentId)
      expect(warning).toContain(mapId)
    })
  })
})
