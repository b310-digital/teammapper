import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConfigModule } from '@nestjs/config'
import * as Y from 'yjs'
import { v4 as uuidv4 } from 'uuid'
import AppModule from '../../app.module'
import {
  createTestConfiguration,
  destroyWorkerDatabase,
} from '../../../test/db'
import { truncateDatabase } from 'test/helper'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { YjsPersistenceService } from './yjs-persistence.service'
import { hydrateYDoc } from '../utils/yDocConversion'
import { jest } from '@jest/globals'

describe('YjsPersistenceService', () => {
  let service: YjsPersistenceService
  let nodesRepo: Repository<MmpNode>
  let mapsRepo: Repository<MmpMap>
  let moduleFixture: TestingModule

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true })

    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(
          await createTestConfiguration(process.env.JEST_WORKER_ID || '')
        ),
        AppModule,
      ],
    }).compile()

    mapsRepo = moduleFixture.get<Repository<MmpMap>>(getRepositoryToken(MmpMap))
    nodesRepo = moduleFixture.get<Repository<MmpNode>>(
      getRepositoryToken(MmpNode)
    )
    service = new YjsPersistenceService(nodesRepo, mapsRepo)
  })

  afterAll(async () => {
    await destroyWorkerDatabase(
      mapsRepo.manager.connection,
      process.env.JEST_WORKER_ID || ''
    )
    await moduleFixture.close()
    jest.useRealTimers()
  })

  beforeEach(async () => {
    await truncateDatabase(mapsRepo.manager.connection)
    jest.restoreAllMocks()
  })

  const createMapWithRootNode = async (): Promise<{
    map: MmpMap
    rootNode: MmpNode
  }> => {
    const map = await mapsRepo.save({
      name: 'Test Map',
      options: { fontMaxSize: 28, fontMinSize: 6, fontIncrement: 2 },
    })
    const rootNode = await nodesRepo.save({
      nodeMapId: map.id,
      name: 'Root',
      root: true,
      detached: false,
      coordinatesX: 0,
      coordinatesY: 0,
      k: 1,
    })
    return { map, rootNode }
  }

  const hydrateFromDb = async (
    map: MmpMap,
    nodes?: MmpNode[]
  ): Promise<Y.Doc> => {
    const doc = new Y.Doc()
    const dbNodes =
      nodes ?? (await nodesRepo.find({ where: { nodeMapId: map.id } }))
    hydrateYDoc(doc, dbNodes, map)
    return doc
  }

  const addChildToDoc = (doc: Y.Doc, parentId: string): string => {
    const childId = uuidv4()
    const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
    const child = new Y.Map<unknown>()
    child.set('id', childId)
    child.set('parent', parentId)
    child.set('name', 'Child Node')
    child.set('isRoot', false)
    child.set('locked', false)
    child.set('detached', false)
    child.set('k', 1)
    child.set('coordinates', { x: 100, y: 50 })
    child.set('colors', { name: '#333', background: '#fff', branch: '' })
    child.set('font', { style: 'normal', size: 16, weight: 'normal' })
    child.set('image', { src: '', size: 0 })
    child.set('link', { href: '' })
    nodesMap.set(childId, child)
    return childId
  }

  describe('persistDoc', () => {
    it('persists new Y.Doc nodes to the database', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)
      addChildToDoc(doc, rootNode.id)

      await service.persistDoc(map.id, doc)

      const dbNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(dbNodes).toHaveLength(2)

      doc.destroy()
    })

    it('persists child node coordinates correctly', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)
      addChildToDoc(doc, rootNode.id)

      await service.persistDoc(map.id, doc)

      const dbNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(dbNodes.find((n) => n.name === 'Child Node')).toMatchObject({
        coordinatesX: 100,
        coordinatesY: 50,
      })

      doc.destroy()
    })

    it('updates map name from Y.Doc options', async () => {
      const { map } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)
      const optionsMap = doc.getMap('mapOptions') as Y.Map<unknown>
      optionsMap.set('name', 'Updated Map Name')

      await service.persistDoc(map.id, doc)

      const updatedMap = await mapsRepo.findOne({ where: { id: map.id } })
      expect(updatedMap!.name).toBe('Updated Map Name')

      doc.destroy()
    })

    it('updates lastModified timestamp on persist', async () => {
      const { map } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)

      const beforePersist = new Date()
      await service.persistDoc(map.id, doc)

      const updatedMap = await mapsRepo.findOne({ where: { id: map.id } })
      expect(updatedMap!.lastModified!.getTime()).toBeGreaterThanOrEqual(
        beforePersist.getTime()
      )

      doc.destroy()
    })

    it('removes nodes not present in Y.Doc', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      await nodesRepo.save({
        nodeMapId: map.id,
        name: 'Extra Node',
        root: false,
        detached: true,
        coordinatesX: 50,
        coordinatesY: 50,
        k: 1,
      })
      const doc = await hydrateFromDb(map, [rootNode])

      await service.persistDoc(map.id, doc)

      const dbNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(dbNodes).toEqual([expect.objectContaining({ name: 'Root' })])

      doc.destroy()
    })

    it('updates existing nodes in place', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)

      const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
      nodesMap.get(rootNode.id)!.set('name', 'Renamed Root')

      await service.persistDoc(map.id, doc)

      const dbNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(dbNodes).toEqual([
        expect.objectContaining({ id: rootNode.id, name: 'Renamed Root' }),
      ])

      doc.destroy()
    })

    it('deletes all DB nodes when Y.Doc nodes map is empty', async () => {
      const { map } = await createMapWithRootNode()
      const doc = new Y.Doc()
      hydrateYDoc(doc, [], map)

      await service.persistDoc(map.id, doc)

      const dbNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(dbNodes).toHaveLength(0)

      doc.destroy()
    })

    it('sets lastModified on each persisted node', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map, [rootNode])

      const beforePersist = new Date()
      await service.persistDoc(map.id, doc)

      const dbNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(dbNodes[0].lastModified!.getTime()).toBeGreaterThanOrEqual(
        beforePersist.getTime()
      )

      doc.destroy()
    })
  })

  describe('debounced persistence', () => {
    it('debounces multiple updates into one persist', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)
      const persistSpy = jest
        .spyOn(service, 'persistDoc')
        .mockResolvedValue(undefined)

      service.registerDebounce(map.id, doc)
      const yRoot = (doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).get(
        rootNode.id
      )!
      yRoot.set('name', 'Update 1')
      yRoot.set('name', 'Update 2')
      yRoot.set('name', 'Update 3')
      await jest.advanceTimersByTimeAsync(2_500)

      expect(persistSpy).toHaveBeenCalledTimes(1)

      service.unregisterDebounce(map.id)
      doc.destroy()
    })

    it('resets debounce timer on new changes', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)
      const persistSpy = jest
        .spyOn(service, 'persistDoc')
        .mockResolvedValue(undefined)

      service.registerDebounce(map.id, doc)
      const yRoot = (doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).get(
        rootNode.id
      )!
      yRoot.set('name', 'Change 1')
      await jest.advanceTimersByTimeAsync(1_500)
      yRoot.set('name', 'Change 2')
      await jest.advanceTimersByTimeAsync(2_500)

      expect(persistSpy).toHaveBeenCalledTimes(1)

      service.unregisterDebounce(map.id)
      doc.destroy()
    })
  })

  describe('persistImmediately', () => {
    it('persists immediately and cancels pending debounce', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)
      const persistSpy = jest
        .spyOn(service, 'persistDoc')
        .mockResolvedValue(undefined)

      service.registerDebounce(map.id, doc)
      const yRoot = (doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).get(
        rootNode.id
      )!
      yRoot.set('name', 'Immediate Change')

      await service.persistImmediately(map.id, doc)
      await jest.advanceTimersByTimeAsync(3_000)

      expect(persistSpy).toHaveBeenCalledTimes(1)

      service.unregisterDebounce(map.id)
      doc.destroy()
    })

    it('handles persist errors without throwing', async () => {
      const doc = new Y.Doc()

      await expect(
        service.persistImmediately(uuidv4(), doc)
      ).resolves.toBeUndefined()

      doc.destroy()
    })
  })

  describe('unregisterDebounce', () => {
    it('removes the observer so changes after unregister do not trigger persist', async () => {
      const { map, rootNode } = await createMapWithRootNode()
      const doc = await hydrateFromDb(map)
      const persistSpy = jest
        .spyOn(service, 'persistDoc')
        .mockResolvedValue(undefined)

      service.registerDebounce(map.id, doc)
      service.unregisterDebounce(map.id)

      const yRoot = (doc.getMap('nodes') as Y.Map<Y.Map<unknown>>).get(
        rootNode.id
      )!
      yRoot.set('name', 'After Unregister')
      await jest.advanceTimersByTimeAsync(3_000)

      expect(persistSpy).not.toHaveBeenCalled()

      doc.destroy()
    })
  })
})
