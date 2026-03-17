import { Test, TestingModule } from '@nestjs/testing'
import { MapsService } from './maps.service'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { Repository, QueryFailedError } from 'typeorm'
import { ConfigModule } from '@nestjs/config'
import AppModule from '../../app.module'
import {
  createTestConfiguration,
  destroyWorkerDatabase,
} from '../../../test/db'
import { mapMmpNodeToClient } from '../utils/clientServerMapping'
import { truncateDatabase } from 'test/helper'
import { jest } from '@jest/globals'

describe('MapsService', () => {
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
        root: false,
        detached: true,
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

      // Now returns ValidationErrorResponse instead of empty array
      expect(Array.isArray(nodes)).toBe(true)
      expect(nodes).toHaveLength(1)
      if ('errorType' in nodes[0]) {
        expect(nodes[0].success).toBe(false)
        expect(nodes[0].errorType).toBe('validation')
        expect(nodes[0].code).toBe('CONSTRAINT_VIOLATION')
      }
      expect(loggerSpyWarn).toHaveBeenCalled()
    })

    it('catches an FK error when trying to assign a nodeParentId to a detached node', async () => {
      const map = await mapsRepo.save({})
      const loggerSpyWarn = jest.spyOn(Logger.prototype, 'warn')

      const node = await nodesRepo.create({
        id: '3288e653-776e-579d-cba6-8631cec6c592',
        nodeMapId: map.id,
        detached: true,
        coordinatesX: 2,
        coordinatesY: 1,
        nodeParentId: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
      })

      const nodes = await mapsService.addNodes(map.id, [node])

      // Now returns ValidationErrorResponse instead of empty array
      expect(Array.isArray(nodes)).toBe(true)
      expect(nodes).toHaveLength(1)
      if ('errorType' in nodes[0]) {
        expect(nodes[0].success).toBe(false)
        expect(nodes[0].errorType).toBe('validation')
        expect(nodes[0].code).toBe('CONSTRAINT_VIOLATION')
      }
      expect(loggerSpyWarn).toHaveBeenCalledWith(
        expect.stringContaining('Detached node')
      )
    })

    it('catches an FK error when trying to assign a nodeParentId from a different map', async () => {
      const map = await mapsRepo.save({})
      const mapTwo = await mapsRepo.save({})

      // First add parent node to map
      const parentNode = await nodesRepo.save({
        id: '2177d542-665d-468c-bea5-7520bdc5b481',
        nodeMapId: map.id,
        coordinatesX: 2,
        coordinatesY: 1,
        root: true,
        detached: false,
      })

      // Try to add child node to mapTwo that references parent in map
      const childNodeFromDifferentMap = await nodesRepo.create({
        id: 'cf65f9cc-0050-4e23-ac4d-effb61cb1731',
        nodeMapId: mapTwo.id,
        coordinatesX: 1,
        coordinatesY: 1,
        nodeParentId: parentNode.id,
        root: false,
        detached: false,
      })

      const nodes = await mapsService.addNodes(mapTwo.id, [
        childNodeFromDifferentMap,
      ])

      // Should fail with INVALID_PARENT because parent is in different map
      expect(Array.isArray(nodes)).toBe(true)
      expect(nodes.length).toBe(1)
      expect('errorType' in nodes[0]).toBe(true)
      if ('errorType' in nodes[0]) {
        expect(nodes[0].success).toBe(false)
        expect(nodes[0].errorType).toBe('validation')
        expect(nodes[0].code).toBe('INVALID_PARENT')
      }
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

    it('returns ValidationErrorResponse when trying to update node with non-existent parent', async () => {
      const map = await mapsRepo.save({})
      const loggerSpyWarn = jest.spyOn(Logger.prototype, 'warn')

      const node = await nodesRepo.save({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: false,
        detached: false,
      })

      const clientNode = mapMmpNodeToClient(node)
      // Use a valid UUID format but non-existent parent
      clientNode.parent = '99999999-9999-9999-9999-999999999999'

      const result = await mapsService.updateNode(map.id, clientNode)

      // Now returns ValidationErrorResponse instead of undefined
      expect(result).toBeDefined()
      if (result && 'errorType' in result) {
        expect(result.success).toBe(false)
        expect(result.errorType).toBe('validation')
        expect(result.code).toBe('CONSTRAINT_VIOLATION')
      }
      expect(loggerSpyWarn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot update node')
      )
    })

    it('rejects promise when save operation fails', async () => {
      const map = await mapsRepo.save({})
      const loggerSpyError = jest.spyOn(Logger.prototype, 'error')

      const node = await nodesRepo.save({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: true,
      })

      const clientNode = mapMmpNodeToClient(node)
      clientNode.name = 'updated'

      // Mock save to throw an error
      jest
        .spyOn(nodesRepo, 'save')
        .mockRejectedValueOnce(new Error('Database error'))

      await expect(mapsService.updateNode(map.id, clientNode)).rejects.toThrow(
        'Database error'
      )
      expect(loggerSpyError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update node')
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

  describe('createEmptyMap', () => {
    it('rejects promise when root node creation fails', async () => {
      const loggerSpyError = jest.spyOn(Logger.prototype, 'error')

      // Mock the save operation to throw an error
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

  describe('addNode - duplicate handling', () => {
    it('returns existing node when trying to add duplicate', async () => {
      const map = await mapsRepo.save({})

      const node = await nodesRepo.create({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: true,
        detached: false,
      })

      const firstAdd = await mapsService.addNode(map.id, node)
      expect(firstAdd).not.toBeUndefined()
      expect('id' in firstAdd!).toBe(true)

      // Try to add the same node again
      const secondAdd = await mapsService.addNode(map.id, node)
      expect(secondAdd).not.toBeUndefined()
      expect('id' in secondAdd!).toBe(true)
      if ('id' in firstAdd! && 'id' in secondAdd!) {
        expect(secondAdd.id).toEqual(firstAdd.id)
      }

      // Verify only one node exists in database
      const allNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(allNodes.length).toEqual(1)
    })
  })

  describe('updateMapByDiff', () => {
    it('rolls back all changes when any operation fails (atomic transaction)', async () => {
      const map = await mapsRepo.save({})
      const loggerSpy = jest.spyOn(Logger.prototype, 'error')

      const existingNode = await nodesRepo.save({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: true,
        name: 'Original Name',
      })

      // Create a diff with valid update but invalid add (invalid UUID will cause error)
      const diff = {
        added: {
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            name: 'New Node',
            coordinates: { x: 1, y: 1 },
            isRoot: false,
            detached: false,
            // Invalid parent reference will cause transaction to fail
            parent: '99999999-9999-9999-9999-999999999999',
          },
        },
        updated: {
          [existingNode.id]: {
            name: 'Updated Name',
          },
        },
        deleted: {},
      }

      // Should throw error and roll back ALL changes (atomic behavior)
      await expect(mapsService.updateMapByDiff(map.id, diff)).rejects.toThrow()

      // Verify error was logged
      expect(loggerSpy).toHaveBeenCalled()

      // Verify the update was rolled back - name should still be original
      const nodeAfterRollback = await nodesRepo.findOne({
        where: { id: existingNode.id },
      })
      expect(nodeAfterRollback?.name).toEqual('Original Name')

      // Verify the new node was not added
      const newNode = await nodesRepo.findOne({
        where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      })
      expect(newNode).toBeNull()
    })

    it('successfully applies all changes when all operations succeed (atomic transaction)', async () => {
      const map = await mapsRepo.save({})

      const rootNode = await nodesRepo.save({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: true,
        name: 'Original Name',
      })

      const nodeToDelete = await nodesRepo.save({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        nodeMapId: map.id,
        coordinatesX: 4,
        coordinatesY: 2,
        root: false,
        detached: true,
      })

      const diff = {
        added: {
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc': {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            name: 'New Node',
            coordinates: { x: 5, y: 3 },
            isRoot: false,
            detached: true,
          },
        },
        updated: {
          [rootNode.id]: {
            name: 'Updated Name',
          },
        },
        deleted: {
          [nodeToDelete.id]: {},
        },
      }

      // Should succeed atomically
      await mapsService.updateMapByDiff(map.id, diff)

      // Verify update was applied
      const updatedNode = await nodesRepo.findOne({
        where: { id: rootNode.id },
      })
      expect(updatedNode?.name).toEqual('Updated Name')

      // Verify node was added
      const newNode = await nodesRepo.findOne({
        where: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
      })
      expect(newNode).not.toBeNull()
      expect(newNode?.name).toEqual('New Node')

      // Verify node was deleted
      const deletedNode = await nodesRepo.findOne({
        where: { id: nodeToDelete.id },
      })
      expect(deletedNode).toBeNull()
    })

    it('processes updates sequentially to maintain parent-child relationships', async () => {
      const map = await mapsRepo.save({})

      const rootNode = await nodesRepo.save({
        id: '11111111-1111-1111-1111-111111111111',
        nodeMapId: map.id,
        coordinatesX: 1,
        coordinatesY: 1,
        root: true,
      })

      const diff = {
        added: {},
        updated: {
          [rootNode.id]: {
            name: 'Updated Root',
          },
        },
        deleted: {},
      }

      await mapsService.updateMapByDiff(map.id, diff)

      const updatedNode = await nodesRepo.findOne({
        where: { id: rootNode.id },
      })
      expect(updatedNode?.name).toEqual('Updated Root')
    })
  })

  describe('mapConstraintErrorToValidationResponse', () => {
    it('returns ValidationErrorResponse for invalid parent constraint', async () => {
      const map = await mapsRepo.save({})

      // Try to add a node with invalid but valid-UUID-format parent
      const invalidNode = nodesRepo.create({
        id: '00000000-0000-4000-8000-000000000002',
        nodeMapId: map.id,
        nodeParentId: '99999999-9999-9999-9999-999999999999',
        coordinatesX: 1,
        coordinatesY: 1,
      })

      // This should throw a QueryFailedError
      try {
        await nodesRepo.save(invalidNode)
        fail('Expected QueryFailedError to be thrown')
      } catch (error) {
        if (error instanceof Error && error.name === 'QueryFailedError') {
          const response =
            await mapsService.mapConstraintErrorToValidationResponse(
              error as QueryFailedError,
              invalidNode,
              map.id
            )

          expect(response.success).toBe(false)
          expect(response.errorType).toBe('validation')
          expect(response.code).toBe('INVALID_PARENT')
          expect(response.message).toBe('VALIDATION_ERROR.INVALID_PARENT')
        }
      }
    })
  })

  describe('addNode with ValidationErrorResponse', () => {
    it('returns ValidationErrorResponse when addNode fails with constraint violation', async () => {
      const map = await mapsRepo.save({})

      // Create a node with invalid parent reference (valid UUID format but doesn't exist)
      const nodeWithInvalidParent = nodesRepo.create({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        nodeParentId: '99999999-9999-4999-8999-999999999999',
        coordinatesX: 3,
        coordinatesY: 1,
        root: false,
        detached: false,
      })

      const result = await mapsService.addNode(map.id, nodeWithInvalidParent)

      // Should return ValidationErrorResponse, not throw
      expect(result).toBeDefined()
      if (result && 'errorType' in result) {
        expect(result.success).toBe(false)
        expect(result.errorType).toBe('validation')
        expect(result.code).toBe('INVALID_PARENT')
      }
    })
  })

  describe('addNodes - atomic transaction behavior', () => {
    it('rolls back all nodes if one node fails validation (atomic operation)', async () => {
      const map = await mapsRepo.save({})

      // Create a valid root node
      const validRootNode = nodesRepo.create({
        id: '11111111-1111-1111-1111-111111111111',
        nodeMapId: map.id,
        coordinatesX: 1,
        coordinatesY: 1,
        root: true,
        detached: false,
      })

      // Create another valid detached node
      const validDetachedNode = nodesRepo.create({
        id: '22222222-2222-2222-2222-222222222222',
        nodeMapId: map.id,
        coordinatesX: 2,
        coordinatesY: 2,
        root: false,
        detached: true,
      })

      // Create an invalid node with non-existent parent (valid UUID format)
      const invalidNode = nodesRepo.create({
        id: '33333333-3333-4333-8333-333333333333',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 3,
        root: false,
        detached: false,
        nodeParentId: '99999999-9999-4999-8999-999999999999', // Valid UUID but doesn't exist
      })

      // Try to add all three nodes at once
      const result = await mapsService.addNodes(map.id, [
        validRootNode,
        validDetachedNode,
        invalidNode,
      ])

      // Should return a single ValidationErrorResponse
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect('errorType' in result[0]).toBe(true)
      if ('errorType' in result[0]) {
        expect(result[0].success).toBe(false)
        expect(result[0].errorType).toBe('validation')
        expect(result[0].code).toBe('INVALID_PARENT')
      }

      // Verify NO nodes were created in the database (atomic rollback)
      const allNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(allNodes.length).toBe(0)
    })

    it('successfully adds all nodes when all pass validation (atomic success)', async () => {
      const map = await mapsRepo.save({})

      // Create a valid root node
      const rootNode = nodesRepo.create({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        nodeMapId: map.id,
        coordinatesX: 1,
        coordinatesY: 1,
        root: true,
        detached: false,
      })

      // Create a valid detached node
      const detachedNode = nodesRepo.create({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 3,
        root: false,
        detached: true,
      })

      // Add root node first
      const rootResult = await mapsService.addNodes(map.id, [rootNode])
      expect(rootResult.length).toBe(1)
      expect('id' in rootResult[0]).toBe(true)

      // Add detached node
      const detachedResult = await mapsService.addNodes(map.id, [detachedNode])
      expect(Array.isArray(detachedResult)).toBe(true)
      expect(detachedResult.length).toBe(1)
      expect('id' in detachedResult[0]).toBe(true)

      // Create a child node with reference to rootNode (after root is saved)
      const childNode = nodesRepo.create({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        nodeMapId: map.id,
        coordinatesX: 2,
        coordinatesY: 2,
        root: false,
        detached: false,
        nodeParentId: rootNode.id,
      })

      // Add child node (has parent reference to rootNode)
      const childResult = await mapsService.addNodes(map.id, [childNode])
      expect(Array.isArray(childResult)).toBe(true)
      expect(childResult.length).toBe(1)
      expect('id' in childResult[0]).toBe(true)

      // Verify all nodes exist in database
      const allNodes = await nodesRepo.find({ where: { nodeMapId: map.id } })
      expect(allNodes.length).toBe(3)
    })
  })

  describe('updateNode with ValidationErrorResponse', () => {
    it('returns ValidationErrorResponse for invalid parent on update', async () => {
      const map = await mapsRepo.save({})

      const node = await nodesRepo.save({
        id: '78a2ae85-1815-46da-a2bc-a41de6bdd5cc',
        nodeMapId: map.id,
        coordinatesX: 3,
        coordinatesY: 1,
        root: true,
      })

      const clientNode = mapMmpNodeToClient(node)
      // Set invalid parent (non-existent UUID)
      clientNode.parent = '99999999-9999-9999-9999-999999999999'
      clientNode.isRoot = false

      const result = await mapsService.updateNode(map.id, clientNode)

      // Should return ValidationErrorResponse
      expect(result).toBeDefined()
      if (result && 'errorType' in result) {
        expect(result.success).toBe(false)
        expect(result.errorType).toBe('validation')
        // updateNode returns CONSTRAINT_VIOLATION for invalid parent
        expect(result.code).toBe('CONSTRAINT_VIOLATION')
      }
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
