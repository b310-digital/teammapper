import { Test, TestingModule } from '@nestjs/testing'
import { MapsService } from './maps.service'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { Repository } from 'typeorm'
import { ConfigModule } from '@nestjs/config'
import AppModule from '../../app.module'
import {
  createTestConfiguration,
  destroyWorkerDatabase,
} from '../../../test/db'
import { truncateDatabase } from 'test/helper'
import { jest } from '@jest/globals'

describe('MapsService', () => {
  let mapsService: MapsService
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

    mapsService = new MapsService(nodesRepo, mapsRepo)
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
        detached: true,
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
        detached: false,
      })

      const first = await mapsService.addNodes(map.id, [node])
      expect(first).toHaveLength(1)

      const second = await mapsService.addNodes(map.id, [node])
      expect(second).toHaveLength(0)

      const allNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(allNodes.length).toBe(1)
    })

    it('throws and rolls back on database errors', async () => {
      const map = await mapsRepo.save({})
      const loggerSpyError = jest.spyOn(Logger.prototype, 'error')

      const invalidNode = nodesRepo.create({
        id: '33333333-3333-4333-8333-333333333333',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 3,
        root: false,
        detached: false,
        nodeParentId: '99999999-9999-4999-8999-999999999999',
      })

      await expect(
        mapsService.addNodes(map.id, [invalidNode])
      ).rejects.toThrow()
      expect(loggerSpyError).toHaveBeenCalled()

      const allNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(allNodes.length).toBe(0)
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
