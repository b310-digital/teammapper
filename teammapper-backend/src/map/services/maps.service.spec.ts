import { Test, TestingModule } from '@nestjs/testing'
import { MapsService } from './maps.service'
import { ImagesService } from './images.service'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpArrow } from '../entities/mmpArrow.entity'
import { MapNode } from '@teammapper/shared'
import { createMmpClientMap } from '../utils/tests/mapFactories'
import { Repository } from 'typeorm'
import { ConfigModule } from '@nestjs/config'
import AppModule from '../../app.module'
import {
  createTestConfiguration,
  destroyWorkerDatabase,
} from '../../../test/db'
import { truncateDatabase } from 'test/helper'
import { jest } from '@jest/globals'
import { orderNodesFromRoot } from '../utils/nodeOrdering'

describe('MapsService', () => {
  let mapsService: MapsService
  let nodesRepo: Repository<MmpNode>
  let mapsRepo: Repository<MmpMap>
  let arrowsRepo: Repository<MmpArrow>
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

    arrowsRepo = moduleFixture.get<Repository<MmpArrow>>(
      getRepositoryToken(MmpArrow)
    )

    mapsService = new MapsService(
      nodesRepo,
      mapsRepo,
      moduleFixture.get(ImagesService)
    )
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
  })

  const createNode = async (map: MmpMap, lastModified: Date) => {
    return nodesRepo.save({
      nodeMapId: map.id,
      coordinatesX: 3,
      coordinatesY: 1,
      lastModified: lastModified,
      createdAt: new Date(),
    })
  }

  describe('addNodes', () => {
    it('bulk-inserts nodes for the duplicate-map flow', async () => {
      const map = await mapsRepo.save({})

      const node = nodesRepo.create({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: false,
      })

      const inserted = await mapsService.addNodes(map.id, [node])

      expect(inserted).toHaveLength(1)
      const createdNode = await nodesRepo.findOne({
        where: { id: node.id },
      })
      expect(createdNode).not.toBeNull()
    })

    it('skips nodes that already exist in the map', async () => {
      const map = await mapsRepo.save({})

      const node = nodesRepo.create({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: true,
      })

      const first = await mapsService.addNodes(map.id, [node])
      expect(first).toHaveLength(1)

      const second = await mapsService.addNodes(map.id, [node])
      expect(second).toHaveLength(0)

      const allNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(allNodes.length).toBe(1)
    })

    it('copies every node of a two-root map through findNodes and addNodes', async () => {
      const source = await mapsRepo.save({})
      const copy = await mapsRepo.save({})
      const node = (id: string, parentId: string | null, root = false) =>
        nodesRepo.create({
          id,
          nodeMapId: source.id,
          nodeParentId: parentId ?? undefined,
          coordinatesX: 0,
          coordinatesY: 0,
          root,
        })
      const main = '11111111-1111-4111-8111-111111111111'
      const second = '22222222-2222-4222-8222-222222222222'
      const secondChild = '33333333-3333-4333-8333-333333333333'
      const ordered = orderNodesFromRoot([
        node(secondChild, second),
        node(second, null),
        node(main, null, true),
      ])

      await mapsService.addNodes(source.id, ordered)
      await mapsService.addNodes(
        copy.id,
        await mapsService.findNodes(source.id)
      )

      const copied = await nodesRepo.find({ where: { nodeMapId: copy.id } })
      expect(copied.map((n) => [n.id, n.nodeParentId ?? null]).sort()).toEqual(
        [
          [main, null],
          [second, null],
          [secondChild, second],
        ].sort()
      )
    })

    it('duplicates a map holding a parent cycle without the cycle', async () => {
      const source = await mapsRepo.save({})
      const copy = await mapsRepo.save({})
      const root = '11111111-1111-4111-8111-111111111111'
      const a = '22222222-2222-4222-8222-222222222222'
      const b = '33333333-3333-4333-8333-333333333333'
      const save = (id: string, parentId: string | null, isRoot = false) =>
        nodesRepo.save(
          nodesRepo.create({
            id,
            nodeMapId: source.id,
            nodeParentId: parentId,
            coordinatesX: 0,
            coordinatesY: 0,
            root: isRoot,
          })
        )
      await save(root, null, true)
      await save(a, root)
      await save(b, a)
      await nodesRepo.update(
        { id: a, nodeMapId: source.id },
        { nodeParentId: b }
      )

      await mapsService.addNodes(
        copy.id,
        await mapsService.findNodes(source.id)
      )

      const copied = await nodesRepo.find({ where: { nodeMapId: copy.id } })
      expect(copied.map((n) => n.id)).toEqual([root])
    })

    it('throws and rolls back on database errors', async () => {
      const map = await mapsRepo.save({})
      const loggerSpyError = jest.spyOn(Logger.prototype, 'error')

      const invalidNode = nodesRepo.create({
        id: '33333333-3333-4333-8333-333333333333',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 3,
        root: true,
        // Entity validation accepts 1.5, and Postgres rejects it as an integer
        fontSize: 1.5,
      })

      await expect(
        mapsService.addNodes(map.id, [invalidNode])
      ).rejects.toThrow()
      expect(loggerSpyError).toHaveBeenCalled()

      const allNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(allNodes.length).toBe(0)
    })
  })

  describe('arrows', () => {
    const rootId = '11111111-1111-4111-8111-111111111111'
    const sourceId = '22222222-2222-4222-8222-222222222222'
    const targetId = '33333333-3333-4333-8333-333333333333'

    const saveNodeOf = (
      mapId: string,
      id: string,
      parentId?: string
    ): Promise<MmpNode> =>
      nodesRepo.save(
        nodesRepo.create({
          id,
          nodeMapId: mapId,
          nodeParentId: parentId,
          root: parentId === undefined,
          coordinatesX: 0,
          coordinatesY: 0,
        })
      )

    // A map with a root and two children and one arrow between the children
    const saveMapWithArrow = async (): Promise<MmpMap> => {
      const map = await mapsRepo.save({})
      await saveNodeOf(map.id, rootId)
      await saveNodeOf(map.id, sourceId, rootId)
      await saveNodeOf(map.id, targetId, rootId)
      await arrowsRepo.insert({
        nodeMapId: map.id,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
      })
      return map
    }

    const clientNode = (id: string, parent: string | null): MapNode => ({
      id,
      parent,
      name: id,
      isRoot: parent === null,
      protected: false,
      k: 1,
      coordinates: { x: 0, y: 0 },
      colors: { name: '', background: '', branch: '' },
      font: { style: '', size: 12, weight: '' },
      image: { src: '', size: 0 },
      link: { href: '' },
    })

    it('deletes the arrows of a node when the node is deleted', async () => {
      const map = await saveMapWithArrow()

      await nodesRepo.delete({ nodeMapId: map.id, id: targetId })

      expect(await arrowsRepo.count({ where: { nodeMapId: map.id } })).toBe(0)
    })

    it('deletes the arrows of a map when the map is deleted', async () => {
      const map = await saveMapWithArrow()

      await mapsService.deleteMap(map.id)

      expect(await arrowsRepo.count()).toBe(0)
    })

    it('deletes the arrows of a map when deleteOutdatedMaps deletes the map', async () => {
      jest.setSystemTime(new Date('2021-01-31'))
      const map = await saveMapWithArrow()
      const outdated = new Date('2021-01-01')
      await mapsRepo.update(map.id, { lastModified: outdated })
      await nodesRepo.update({ nodeMapId: map.id }, { lastModified: outdated })

      await mapsService.deleteOutdatedMaps(30)

      expect({
        map: await mapsService.findMap(map.id),
        arrows: await arrowsRepo.count(),
      }).toEqual({ map: null, arrows: 0 })
    })

    it('refuses an arrow that names a node of another map', async () => {
      const map = await saveMapWithArrow()
      const other = await mapsRepo.save({})
      const foreignId = '44444444-4444-4444-8444-444444444444'
      await saveNodeOf(other.id, foreignId)

      await expect(
        arrowsRepo.insert({
          nodeMapId: map.id,
          sourceNodeId: sourceId,
          targetNodeId: foreignId,
        })
      ).rejects.toThrow()
    })

    it('refuses a second arrow with the same source and target', async () => {
      const map = await saveMapWithArrow()

      await expect(
        arrowsRepo.insert({
          nodeMapId: map.id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
        })
      ).rejects.toThrow()
    })

    it('finds the arrows of a map as source and target pairs', async () => {
      const map = await saveMapWithArrow()

      expect(await mapsService.findArrows(map.id)).toEqual([
        { source: sourceId, target: targetId },
      ])
    })

    it('returns the arrows of a map from exportMapToClient', async () => {
      const map = await saveMapWithArrow()

      const exported = await mapsService.exportMapToClient(map.id)

      expect(exported?.arrows).toEqual([{ source: sourceId, target: targetId }])
    })

    it('copies an arrow with the same node ids into a duplicate', async () => {
      const source = await saveMapWithArrow()
      const copy = await mapsRepo.save({})

      await mapsService.addNodes(
        copy.id,
        await mapsService.findNodes(source.id)
      )
      await mapsService.addArrows(
        copy.id,
        await mapsService.findArrows(source.id)
      )

      expect(await mapsService.findArrows(copy.id)).toEqual([
        { source: sourceId, target: targetId },
      ])
    })

    it('copies no arrow whose endpoint was not copied', async () => {
      const copy = await mapsRepo.save({})
      await saveNodeOf(copy.id, rootId)

      await mapsService.addArrows(copy.id, [
        { source: rootId, target: targetId },
      ])

      expect(await mapsService.findArrows(copy.id)).toEqual([])
    })

    it('replaces the arrows of a map in updateMap', async () => {
      const map = await saveMapWithArrow()
      const clientMap = createMmpClientMap({
        uuid: map.id,
        data: [
          clientNode(rootId, null),
          clientNode(sourceId, rootId),
          clientNode(targetId, rootId),
        ],
        arrows: [{ source: targetId, target: sourceId }],
      })

      await mapsService.updateMap(clientMap)

      expect(await mapsService.findArrows(map.id)).toEqual([
        { source: targetId, target: sourceId },
      ])
    })

    it('leaves no arrow after updateMap with an empty arrow list', async () => {
      const map = await saveMapWithArrow()
      const clientMap = createMmpClientMap({
        uuid: map.id,
        data: [clientNode(rootId, null), clientNode(sourceId, rootId)],
      })

      await mapsService.updateMap(clientMap)

      expect(await mapsService.findArrows(map.id)).toEqual([])
    })

    it('leaves out an arrow naming a node updateMap does not write', async () => {
      const map = await saveMapWithArrow()
      const clientMap = createMmpClientMap({
        uuid: map.id,
        data: [clientNode(rootId, null), clientNode(sourceId, rootId)],
        arrows: [
          { source: sourceId, target: targetId },
          { source: rootId, target: sourceId },
        ],
      })

      await mapsService.updateMap(clientMap)

      expect(await mapsService.findArrows(map.id)).toEqual([
        { source: rootId, target: sourceId },
      ])
    })
  })

  describe('exportMapToClient', () => {
    it('returns undefined when no map is available', async () => {
      expect(
        await mapsService.exportMapToClient(
          '78a2ae85-1815-46da-a2bc-a41de6bdd5ab'
        )
      ).toEqual(undefined)
    })
  })

  describe('deleteOutdatedMaps', () => {
    it('deletes a map based off of lastAccessed', async () => {
      jest.setSystemTime(new Date('2021-01-31'))

      const map = await mapsRepo.save({
        lastAccessed: new Date('2021-01-01'),
        lastModified: new Date('2020-01-01'),
      })

      const node = await createNode(map, new Date('2019-01-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).toEqual(null)
      expect(await nodesRepo.findOne({ where: { id: node.id } })).toEqual(null)
    })

    it('does not delete a new map', async () => {
      jest.setSystemTime(new Date('2024-09-01'))
      const map = await mapsRepo.save({
        lastAccessed: new Date('2024-09-01'),
      })

      const node = await createNode(map, new Date('2024-09-01'))

      await mapsService.deleteOutdatedMaps(30)
      const foundMap = await mapsService.findMap(map.id)
      expect(foundMap?.id).toEqual(map.id)
      expect(await nodesRepo.findOne({ where: { id: node.id } })).not.toBeNull()
    })

    it('deletes a map where lastAccessed is not set and lastModified is too old', async () => {
      jest.setSystemTime(new Date('2021-01-31'))

      const map = await mapsRepo.save({
        lastModified: new Date('2021-01-01'),
      })

      const node = await createNode(map, new Date('2021-01-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).toEqual(null)
      expect(await nodesRepo.findOne({ where: { id: node.id } })).toEqual(null)
    })

    it('does not delete a map where lastModified is old but lastAccessed is recent', async () => {
      jest.setSystemTime(new Date('2024-09-01'))

      const map = await mapsRepo.save({
        lastModified: new Date('2021-01-01'),
        lastAccessed: new Date('2024-09-01'),
      })

      const node = await createNode(map, new Date('2021-01-01'))

      await mapsService.deleteOutdatedMaps(30)
      const foundMap = await mapsService.findMap(map.id)
      expect(foundMap?.id).toEqual(map.id)
      expect(await nodesRepo.findOne({ where: { id: node.id } })).not.toBeNull()
    })

    it('does not delete a map where lastAccessed is old but lastModified is recent', async () => {
      jest.setSystemTime(new Date('2024-09-01'))

      const map = await mapsRepo.save({
        lastAccessed: new Date('2021-01-01'),
        lastModified: new Date('2024-09-01'),
      })

      const node = await createNode(map, new Date('2021-01-01'))

      await mapsService.deleteOutdatedMaps(30)
      const foundMap = await mapsService.findMap(map.id)
      expect(foundMap?.id).toEqual(map.id)
      expect(await nodesRepo.findOne({ where: { id: node.id } })).not.toBeNull()
    })

    it('does delete a map that contains only outdated nodes', async () => {
      jest.setSystemTime(new Date('2021-01-31'))

      const map = await mapsRepo.save({
        lastModified: new Date('2021-01-01'),
      })

      const node = await createNode(map, new Date('2021-01-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).toEqual(null)
      expect(await nodesRepo.findOne({ where: { id: node.id } })).toEqual(null)
    })

    it('does not delete a map that contains a recent node', async () => {
      jest.setSystemTime(new Date('2024-09-01'))

      const map = await mapsRepo.save({
        lastModified: new Date('2021-01-01'),
      })

      const node = await createNode(map, new Date('2024-09-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).not.toBeNull()
      expect(await nodesRepo.findOne({ where: { id: node.id } })).not.toBeNull()
    })

    it('deletes a map which has outdated nodes and outdated lastAccessed', async () => {
      jest.setSystemTime(new Date('2021-01-31'))

      const map = await mapsRepo.save({
        lastAccessed: new Date('2021-01-01'),
        lastModified: new Date('2021-01-01'),
      })

      const node = await createNode(map, new Date('2021-01-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).toEqual(null)
      expect(await nodesRepo.findOne({ where: { id: node.id } })).toEqual(null)
    })

    it('does not delete a map which has outdated lastAccessed but some recent nodes', async () => {
      jest.setSystemTime(new Date('2024-09-01'))

      const map = await mapsRepo.save({
        lastAccessed: new Date('2021-01-01'),
      })

      const outdatedNode = await createNode(map, new Date('2021-01-01'))
      const recentNode = await createNode(map, new Date('2024-09-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).not.toBeNull()
      expect(
        await nodesRepo.findOne({ where: { id: outdatedNode.id } })
      ).not.toBeNull()
      expect(
        await nodesRepo.findOne({ where: { id: recentNode.id } })
      ).not.toBeNull()
    })

    it('does not delete a map which has outdated lastModified but some recent nodes', async () => {
      jest.setSystemTime(new Date('2024-09-01'))

      const map = await mapsRepo.save({
        lastModified: new Date('2021-01-01'),
      })

      const outdatedNode = await createNode(map, new Date('2021-01-01'))
      const recentNode = await createNode(map, new Date('2024-09-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).not.toBeNull()
      expect(
        await nodesRepo.findOne({ where: { id: outdatedNode.id } })
      ).not.toBeNull()
      expect(
        await nodesRepo.findOne({ where: { id: recentNode.id } })
      ).not.toBeNull()
    })

    it('does delete outdated empty maps', async () => {
      jest.setSystemTime(new Date('2021-01-31'))

      const map = await mapsRepo.save({
        lastModified: new Date('2021-01-01'),
      })

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).toBeNull()
    })
  })

  describe('getDeletedAt', () => {
    it('calculates the correct date based on the newest node', async () => {
      const map = await mapsRepo.save({
        lastModified: new Date('2018-02-02'),
      })

      await createNode(map, new Date('2022-01-01'))
      await createNode(map, new Date('2020-02-05'))

      expect(await mapsService.getDeletedAt(map, 5)).toEqual(
        new Date('2022-01-06')
      )
    })

    it('calculates the date based on the map when no node is present', async () => {
      const map = await mapsRepo.save({
        lastModified: new Date('2018-02-02'),
      })

      expect(await mapsService.getDeletedAt(map, 5)).toEqual(
        new Date('2018-02-07')
      )
    })
  })

  describe('createEmptyMap', () => {
    it('rejects promise when root node creation fails', async () => {
      const loggerSpyError = jest.spyOn(Logger.prototype, 'error')

      jest
        .spyOn(nodesRepo, 'save')
        .mockRejectedValueOnce(new Error('Database error'))

      const rootNode = {
        name: 'Root',
        colors: { branch: '#000000', background: '#FFFFFF', name: '#000000' },
        font: { size: 14, style: 'normal', weight: 'normal' },
        image: { src: null, size: null },
      }

      await expect(mapsService.createEmptyMap(rootNode)).rejects.toThrow(
        'Database error'
      )
      expect(loggerSpyError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create root node')
      )
    })

    it('creates a map with a specified userId as owner', async () => {
      const testUserId = 'test-person-id'

      const newMap = await mapsService.createEmptyMap(undefined, testUserId)

      expect(newMap.ownerExternalId).toBe(testUserId)

      const savedMap = await mapsRepo.findOne({ where: { id: newMap.id } })

      expect(savedMap).toBeDefined()
      expect(savedMap?.ownerExternalId).toBe(testUserId)
    })
  })

  describe('getMapsOfUser', () => {
    it('returns [] if no userId is provided', async () => {
      await mapsRepo.save({ ownerExternalId: undefined })
      const result = await mapsService.getMapsOfUser('')
      expect(result).toEqual([])
    })

    it('returns [] if the id is the string undefined', async () => {
      await mapsRepo.save({ ownerExternalId: undefined })
      const result = await mapsService.getMapsOfUser(
        undefined as unknown as string
      )
      expect(result).toEqual([])
    })

    it('returns [] if the id is the string null', async () => {
      await mapsRepo.save({ ownerExternalId: null })
      const result = await mapsService.getMapsOfUser(null as unknown as string)
      expect(result).toEqual([])
    })

    it('returns [] if the id is an empty string', async () => {
      await mapsRepo.save({ ownerExternalId: undefined })
      const result = await mapsService.getMapsOfUser('')
      expect(result).toEqual([])
    })

    it('returns [] if the id is an empty array', async () => {
      await mapsRepo.save({ ownerExternalId: undefined })
      const result = await mapsService.getMapsOfUser([] as unknown as string)
      expect(result).toEqual([])
    })

    it('returns only maps belonging to the given userId', async () => {
      const user1 = 'user1'
      const user2 = 'user2'

      const map1 = await mapsRepo.save({ ownerExternalId: user1 })
      const map2 = await mapsRepo.save({ ownerExternalId: user1 })
      await mapsRepo.save({ ownerExternalId: user2 })

      const maps = await mapsService.getMapsOfUser(user1)

      expect(maps).toHaveLength(2)
      expect(maps.map((m) => m.uuid)).toEqual(
        expect.arrayContaining([map1.id, map2.id])
      )
    })
  })
})
