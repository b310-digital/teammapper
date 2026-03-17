import { YjsDocManagerService } from './yjs-doc-manager.service'
import { MapsService } from './maps.service'
import { YjsPersistenceService } from './yjs-persistence.service'
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpMap } from '../entities/mmpMap.entity'
import { jest } from '@jest/globals'

const createMockMap = (): MmpMap => {
  const map = new MmpMap()
  map.id = 'map-1'
  map.name = 'Test Map'
  map.options = { fontMaxSize: 28, fontMinSize: 6, fontIncrement: 2 }
  return map
}

const createMockNode = (id: string, root = false): MmpNode => {
  const node = new MmpNode()
  node.id = id
  node.nodeMapId = 'map-1'
  node.name = 'Node'
  node.root = root
  node.locked = false
  node.detached = false
  node.k = 1
  node.coordinatesX = 0
  node.coordinatesY = 0
  node.orderNumber = 1
  return node
}

const createMockMapsService = (): jest.Mocked<MapsService> => {
  return {
    findMap: jest.fn<MapsService['findMap']>(),
    findNodes: jest.fn<MapsService['findNodes']>(),
  } as unknown as jest.Mocked<MapsService>
}

const createMockPersistenceService = (): jest.Mocked<YjsPersistenceService> => {
  return {
    persistImmediately: jest.fn<YjsPersistenceService['persistImmediately']>(),
  } as unknown as jest.Mocked<YjsPersistenceService>
}

describe('YjsDocManagerService', () => {
  let service: YjsDocManagerService
  let mapsService: jest.Mocked<MapsService>
  let persistenceService: jest.Mocked<YjsPersistenceService>

  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true })
    mapsService = createMockMapsService()
    persistenceService = createMockPersistenceService()
    persistenceService.persistImmediately.mockResolvedValue(undefined)
    service = new YjsDocManagerService(mapsService, persistenceService)
  })

  afterEach(() => {
    service.onModuleDestroy()
    jest.useRealTimers()
  })

  const setupWithNodes = (
    nodes: MmpNode[] = [createMockNode('root-1', true)]
  ) => {
    mapsService.findMap.mockResolvedValue(createMockMap())
    mapsService.findNodes.mockResolvedValue(nodes)
  }

  const setupConnectedDoc = async (mapId = 'map-1') => {
    setupWithNodes()
    await service.getOrCreateDoc(mapId)
    await service.notifyClientCount(mapId, 1)
  }

  describe('getOrCreateDoc', () => {
    it('queries database for map and nodes', async () => {
      setupWithNodes()

      await service.getOrCreateDoc('map-1')

      expect(mapsService.findMap).toHaveBeenCalledWith('map-1')
      expect(mapsService.findNodes).toHaveBeenCalledWith('map-1')
    })

    it('hydrates Y.Doc with all database nodes', async () => {
      setupWithNodes([
        createMockNode('root-1', true),
        createMockNode('child-1'),
      ])

      const doc = await service.getOrCreateDoc('map-1')

      expect(doc.getMap('nodes').size).toBe(2)
    })

    it('returns existing Y.Doc on subsequent access', async () => {
      setupWithNodes()

      const doc1 = await service.getOrCreateDoc('map-1')
      const doc2 = await service.getOrCreateDoc('map-1')

      expect(doc1).toBe(doc2)
    })

    it('throws when map not found', async () => {
      mapsService.findMap.mockResolvedValue(null)
      mapsService.findNodes.mockResolvedValue([])

      await expect(service.getOrCreateDoc('missing')).rejects.toThrow(
        'Map missing not found'
      )
    })

    it('deduplicates concurrent hydrations for the same mapId', async () => {
      setupWithNodes()

      const [doc1, doc2] = await Promise.all([
        service.getOrCreateDoc('map-1'),
        service.getOrCreateDoc('map-1'),
      ])

      expect(doc1).toBe(doc2)
      expect(mapsService.findMap).toHaveBeenCalledTimes(1)
    })
  })

  describe('notifyClientCount', () => {
    it('cancels grace timer when count is positive', async () => {
      setupWithNodes()
      await service.getOrCreateDoc('map-1')
      await service.notifyClientCount('map-1', 0)

      jest.advanceTimersByTime(15_000)
      await service.notifyClientCount('map-1', 1)
      jest.advanceTimersByTime(20_000)

      expect(service.hasDoc('map-1')).toBe(true)
    })

    it('persists and starts grace timer when count reaches zero', async () => {
      await setupConnectedDoc()

      await service.notifyClientCount('map-1', 0)

      expect(persistenceService.persistImmediately).toHaveBeenCalledWith(
        'map-1',
        expect.anything()
      )
      expect(service.hasDoc('map-1')).toBe(true)
    })

    it('does nothing for untracked map', async () => {
      await service.notifyClientCount('nonexistent', 0)

      expect(persistenceService.persistImmediately).not.toHaveBeenCalled()
    })
  })

  describe('eviction lifecycle', () => {
    it('persists on last client disconnect', async () => {
      await setupConnectedDoc()

      await service.notifyClientCount('map-1', 0)

      expect(persistenceService.persistImmediately).toHaveBeenCalledWith(
        'map-1',
        expect.anything()
      )
    })

    it('retains doc during grace period after last disconnect', async () => {
      await setupConnectedDoc()

      await service.notifyClientCount('map-1', 0)

      expect(service.hasDoc('map-1')).toBe(true)
    })

    it('evicts doc after grace period expires', async () => {
      await setupConnectedDoc()
      await service.notifyClientCount('map-1', 0)

      jest.advanceTimersByTime(31_000)

      expect(service.hasDoc('map-1')).toBe(false)
    })

    it('cancels grace timer if client reconnects', async () => {
      await setupConnectedDoc()
      await service.notifyClientCount('map-1', 0)

      jest.advanceTimersByTime(15_000)
      await service.notifyClientCount('map-1', 1)
      jest.advanceTimersByTime(20_000)

      expect(service.hasDoc('map-1')).toBe(true)
    })

    it('reuses in-memory doc during grace period', async () => {
      setupWithNodes()
      const doc1 = await service.getOrCreateDoc('map-1')
      await service.notifyClientCount('map-1', 1)
      await service.notifyClientCount('map-1', 0)

      jest.advanceTimersByTime(10_000)
      const doc2 = await service.getOrCreateDoc('map-1')

      expect(doc1).toBe(doc2)
      expect(mapsService.findMap).toHaveBeenCalledTimes(1)
    })
  })

  describe('restoreGraceTimer', () => {
    it('starts grace timer when connection count is zero', async () => {
      setupWithNodes()
      await service.getOrCreateDoc('map-1')

      service.restoreGraceTimer('map-1', 0)
      jest.advanceTimersByTime(31_000)

      expect(service.hasDoc('map-1')).toBe(false)
    })

    it('does not start grace timer when connections exist', async () => {
      setupWithNodes()
      await service.getOrCreateDoc('map-1')

      service.restoreGraceTimer('map-1', 2)
      jest.advanceTimersByTime(31_000)

      expect(service.hasDoc('map-1')).toBe(true)
    })
  })

  describe('destroyDoc', () => {
    it('removes doc from memory', async () => {
      await setupConnectedDoc()

      service.destroyDoc('map-1')

      expect(service.hasDoc('map-1')).toBe(false)
    })

    it('cancels grace timer on destroy', async () => {
      await setupConnectedDoc()
      await service.notifyClientCount('map-1', 0)

      service.destroyDoc('map-1')

      expect(service.hasDoc('map-1')).toBe(false)
    })
  })
})
