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
import { mapMmpNodeToClient } from '../utils/clientServerMapping'
import { truncateDatabase } from 'test/helper'
import { jest } from '@jest/globals'

describe('MapsController', () => {
  let mapsService: MapsService
  let nodesRepo: Repository<MmpNode>
  let mapsRepo: Repository<MmpMap>
  let moduleFixture: TestingModule

  beforeAll(async () => {
    // Calling advanceTimers here is very important, as otherwise async ops like await will hang indefinitely
    // Ref: https://jestjs.io/docs/jest-object#jestusefaketimersfaketimersconfig
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
    // close connection:
    await destroyWorkerDatabase(
      mapsRepo.manager.connection,
      process.env.JEST_WORKER_ID || ''
    )
    await moduleFixture.close()

    // Make sure we use real timers after these tests so others are not affected
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
    it('adds a node', async () => {
      const map = await mapsRepo.save({})

      const node = await nodesRepo.create({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
      })

      await mapsService.addNodes(map.id, [node])

      const createdNode = await nodesRepo.findOne({
        where: { id: node.id },
      })

      expect(createdNode).not.toBeUndefined()
    })

    it('catches an FK error when trying to assign a nodeParentId to a root node', async () => {
      const map = await mapsRepo.save({})
      const loggerSpyWarn = jest.spyOn(Logger.prototype, 'warn')

      const node = await nodesRepo.create({
        id: '2177d542-665d-468c-bea5-7520bdc5b481',
        nodeMapId: map.id,
        root: true,
        coordinatesX: 2,
        coordinatesY: 1,
        nodeParentId: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
      })

      const nodes = await mapsService.addNodes(map.id, [node])

      expect(nodes).toEqual([])
      expect(loggerSpyWarn).toHaveBeenCalled()
    })

    it('catches an FK error when trying to assign a nodeParentId from a different map', async () => {
      const map = await mapsRepo.save({})
      const mapTwo = await mapsRepo.save({})
      const loggerSpyWarn = jest.spyOn(Logger.prototype, 'warn')

      const parentNode = await nodesRepo.create({
        id: '2177d542-665d-468c-bea5-7520bdc5b481',
        nodeMapId: map.id,
        coordinatesX: 2,
        coordinatesY: 1,
      })

      const childNodeFromDifferentMap = await nodesRepo.create({
        id: 'cf65f9cc-0050-4e23-ac4d-effb61cb1731',
        nodeMapId: mapTwo.id,
        coordinatesX: 1,
        coordinatesY: 1,
        nodeParentId: parentNode.id,
      })

      const nodes = await mapsService.addNodes(map.id, [
        parentNode,
        childNodeFromDifferentMap,
      ])

      expect(nodes).toEqual([])
      expect(loggerSpyWarn).toHaveBeenCalled()
    })
  })

  describe('updateNode', () => {
    it('does update the lastModified value on update', async () => {
      const map = await mapsRepo.save({
        lastModified: new Date('2019-01-01'),
      })

      const oldDate = new Date('2019-01-01')
      const node = await createNode(map, oldDate)

      const clientNode = mapMmpNodeToClient(node)
      clientNode.name = 'new'

      // we save the time before the update to be able to compare the lastModified date and make sure it's newer than this:
      const timeBeforeUpdate = new Date()
      await mapsService.updateNode(map.id, clientNode)
      const updatedNode = await nodesRepo.findOne({
        where: { id: node.id },
      })

      expect(updatedNode?.lastModified).not.toEqual(oldDate)
      expect(updatedNode?.lastModified!.getTime()).toBeGreaterThan(
        timeBeforeUpdate.getTime()
      )
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
      // Explicitly set system time to lastAccessed + 30 days
      jest.setSystemTime(new Date('2021-01-31'))

      // Last modified is now() by default, so we need to set it here explicitly.
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
      // Explicitly set system time to equal lastAccessed
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
      // Explicitly set system time to lastModified + 30 days
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
      // Explicitly set system time to equal lastAccessed
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
      // Explicitly set system time to equal lastModified
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
      // Explicitly set system time to node + 30 days
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
      // Explicitly set system time to equal node
      jest.setSystemTime(new Date('2024-09-01'))

      // map itself is old, but node is not:
      const map = await mapsRepo.save({
        lastModified: new Date('2021-01-01'),
      })

      const node = await createNode(map, new Date('2024-09-01'))

      await mapsService.deleteOutdatedMaps(30)
      expect(await mapsService.findMap(map.id)).not.toBeNull()
      expect(await nodesRepo.findOne({ where: { id: node.id } })).not.toBeNull()
    })

    it('deletes a map which has outdated nodes and outdated lastAccessed', async () => {
      // Explicitly set system time to lastAccessed + 30 days
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
      // Explcitly set system time to equal recentNode
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
      // Explicitly set system time to equal recentNode
      jest.setSystemTime(new Date('2024-09-01'))

      // map itself is old, but node is not:
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
      // Explicitly set system time to lastModified + 30 days
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

  describe('removeNode', () => {
    it('remove all nodes connected together', async () => {
      const map = await mapsRepo.save({})

      const node = await nodesRepo.save({
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
      })

      const nodeTwo = await nodesRepo.save({
        nodeMapId: map.id,
        nodeParent: node,
        coordinatesX: 3,
        coordinatesY: 1,
      })

      await mapsService.removeNode(mapMmpNodeToClient(node), map.id)
      expect(await nodesRepo.findOne({ where: { id: nodeTwo.id } })).toEqual(
        null
      )
    })
  })
})
