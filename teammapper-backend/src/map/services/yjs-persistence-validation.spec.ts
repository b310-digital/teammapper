import * as Y from 'yjs'
import { Repository } from 'typeorm'
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpMap } from '../entities/mmpMap.entity'
import { YjsPersistenceService } from './yjs-persistence.service'
import { applyValidatedMapUpdate, isRejectedMap } from '../utils/yjsValidation'

const rejectMap = (doc: Y.Doc): void => {
  const client = new Y.Doc()
  try {
    client.getMap('unused').set('payload', 'unrelated data')
    applyValidatedMapUpdate(doc, Y.encodeStateAsUpdate(client), null)
  } catch (error) {
    // Only suppress the expected rejection while preparing persistence fixtures.
    if (!isRejectedMap(doc)) throw error
  } finally {
    client.destroy()
  }
}

const deferred = () => {
  let resolve: () => void = () => {
    throw new Error('Promise not initialized')
  }
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Yjs persistence validation', () => {
  let doc: Y.Doc
  let service: YjsPersistenceService
  const runner = {
    connect: jest.fn<Promise<void>, []>(),
    startTransaction: jest.fn<Promise<void>, []>(),
    commitTransaction: jest.fn<Promise<void>, []>(),
    rollbackTransaction: jest.fn<Promise<void>, []>(),
    release: jest.fn<Promise<void>, []>(),
    isTransactionActive: true,
    isReleased: false,
    manager: {
      delete: jest.fn<Promise<void>, []>(),
      update: jest.fn<Promise<void>, []>(),
    },
  }
  beforeEach(() => {
    jest.useFakeTimers()
    jest.resetAllMocks()
    for (const method of [
      runner.connect,
      runner.startTransaction,
      runner.commitTransaction,
      runner.rollbackTransaction,
      runner.release,
      runner.manager.delete,
      runner.manager.update,
    ]) {
      method.mockResolvedValue(undefined)
    }
    const nodes = {
      manager: { connection: { createQueryRunner: () => runner } },
    } as unknown as Repository<MmpNode>
    service = new YjsPersistenceService(nodes, {} as Repository<MmpMap>)
    doc = new Y.Doc()
    doc.getMap('mapOptions').set('name', 'Map')
  })
  afterEach(() => {
    service.onModuleDestroy()
    doc.destroy()
    jest.useRealTimers()
  })

  it('schedules persistence for accepted updates', async () => {
    service.registerDebounce('map-1', doc)
    const persist = jest
      .spyOn(service, 'persistDoc')
      .mockResolvedValue(undefined)
    const client = new Y.Doc()
    try {
      client.getMap('mapOptions').set('name', 'Updated map')
      applyValidatedMapUpdate(doc, Y.encodeStateAsUpdate(client), null)
      await jest.advanceTimersByTimeAsync(2000)
      expect(persist).toHaveBeenCalledTimes(1)
    } finally {
      client.destroy()
    }
  })

  it('does not schedule persistence for rejected updates', async () => {
    service.registerDebounce('map-1', doc)
    const persist = jest
      .spyOn(service, 'persistDoc')
      .mockResolvedValue(undefined)
    rejectMap(doc)
    await jest.advanceTimersByTimeAsync(10000)
    expect(persist).not.toHaveBeenCalled()
  })

  describe('rejection with an earlier debounce pending', () => {
    beforeEach(() => {
      service.registerDebounce('map-1', doc)
      doc.getMap('mapOptions').set('name', 'Pending valid edit')
      rejectMap(doc)
    })
    it('does not start a database save', async () => {
      await jest.advanceTimersByTimeAsync(2000)
      expect(runner.connect).not.toHaveBeenCalled()
    })
    it('reports immediate persistence as unsuccessful', async () => {
      expect(await service.persistImmediately('map-1', doc)).toBe(false)
    })
  })

  describe('an in-flight save resuming after rejection', () => {
    let outcome: unknown
    beforeEach(async () => {
      const connection = deferred()
      runner.connect.mockReturnValue(connection.promise)
      const saving = service
        .persistDoc('map-1', doc)
        .catch((error: unknown) => error)
      rejectMap(doc)
      connection.resolve()
      outcome = await saving
    })
    it('fails and rolls back the transaction', () => {
      expect(outcome).toEqual(
        new Error('Rejected map state cannot be persisted')
      )
      expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1)
    })
    it('does not write map data', () => {
      expect(runner.manager.delete).not.toHaveBeenCalled()
      expect(runner.manager.update).not.toHaveBeenCalled()
    })
    it('does not commit', () => {
      expect(runner.commitTransaction).not.toHaveBeenCalled()
    })
  })

  describe('rejection before an in-flight save commits', () => {
    let outcome: unknown
    beforeEach(async () => {
      const metadataStarted = deferred()
      const finishMetadata = deferred()
      runner.manager.update.mockImplementation(() => {
        metadataStarted.resolve()
        return finishMetadata.promise
      })
      const saving = service
        .persistDoc('map-1', doc)
        .catch((error: unknown) => error)
      await metadataStarted.promise
      rejectMap(doc)
      finishMetadata.resolve()
      outcome = await saving
    })
    it('fails and rolls back the transaction', () => {
      expect(outcome).toEqual(
        new Error('Rejected map state cannot be persisted')
      )
      expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1)
    })
    it('does not commit', () => {
      expect(runner.commitTransaction).not.toHaveBeenCalled()
    })
  })
})
