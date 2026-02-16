import { INestApplication } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Test } from '@nestjs/testing'
import { Repository } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { io, Socket } from 'socket.io-client'
import { MmpMap } from '../entities/mmpMap.entity'
import { MapsService } from '../services/maps.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsGateway } from '../services/yjs-gateway.service'
import { MapsGateway } from './maps.gateway'
import { MmpNode } from '../entities/mmpNode.entity'
import { createMock } from '@golevelup/ts-jest'
import { IMmpClientNode, OperationResponse } from '../types'

const crypto = require('crypto') // eslint-disable-line @typescript-eslint/no-require-imports

describe('WebSocketGateway', () => {
  let app: INestApplication
  let mapsService: MapsService
  let socket: Socket

  const map: MmpMap = new MmpMap()
  map.id = '123'
  map.modificationSecret = 'abc'

  beforeAll(async () => {
    mapsService = createMock<MapsService>({
      findMap: (_uuid: string) =>
        new Promise((resolve, _reject) => {
          resolve(map)
        }),
      removeNode: (_clientNode: IMmpClientNode, _mapId: string) =>
        new Promise((resolve, _reject) => {
          const node = new MmpNode()
          node.createdAt = new Date('2021-01-31T00:00:00.000Z')
          node.lastModified = new Date('2021-01-31T00:00:00.000Z')
          resolve(node)
        }),
    })
    const testingModule = await Test.createTestingModule({
      providers: [
        MapsGateway,
        { provide: MapsService, useValue: mapsService },
        {
          provide: getRepositoryToken(MmpMap),
          useValue: createMock<Repository<MmpMap>>(),
        },
        {
          provide: getRepositoryToken(MmpNode),
          useValue: createMock<Repository<MmpNode>>(),
        },
        {
          provide: CACHE_MANAGER,
          useValue: createMock<Cache>(),
        },
        {
          provide: YjsDocManagerService,
          useValue: createMock<YjsDocManagerService>(),
        },
        {
          provide: YjsGateway,
          useValue: createMock<YjsGateway>(),
        },
      ],
    }).compile()
    app = testingModule.createNestApplication()
    await app.init()
    await app.listen(3000)
  })

  describe('checkModificationSecret', () => {
    it(`returns false if wrong`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'checkModificationSecret',
        {
          mapId: map.id,
          modificationSecret: 'wrong',
        },
        (result: boolean) => {
          expect(result).toEqual(false)
          done()
        }
      )
    })

    it(`returns true if correct`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'checkModificationSecret',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
        },
        (result: boolean) => {
          expect(result).toEqual(true)
          done()
        }
      )
    })
  })

  describe('addNode', () => {
    it(`will return error response if no new nodes are being added`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'addNodes',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          nodes: [{}],
        },
        (result: OperationResponse<IMmpClientNode[]>) => {
          expect(result.success).toEqual(false)
          if (!result.success) {
            expect(result.errorType).toEqual('validation')
          }
          done()
        }
      )
    })
  })

  describe('updateNode', () => {
    it(`allows request when modification secret is set`, (done) => {
      socket = io('http://localhost:3000')

      const mockNode = new MmpNode()
      mockNode.id = crypto.randomUUID()
      mockNode.name = 'Test'

      jest.spyOn(mapsService, 'updateNode').mockResolvedValueOnce(mockNode)

      socket.emit(
        'updateNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: { id: mockNode.id, name: 'Test' },
          updatedProperty: 'name',
        },
        (result: OperationResponse<IMmpClientNode>) => {
          expect(result.success).toEqual(true)
          done()
        }
      )
    })
  })

  describe('removeNode', () => {
    it(`allows request when modification secret is set`, (done) => {
      socket = io('http://localhost:3000')

      // Date objects are serialised to JSON in the result, so we'll need to be explicit in setting these here
      const defaultNode = {
        id: crypto.randomUUID(),
        createdAt: new Date('2021-01-31T00:00:00.000Z').toISOString(),
        lastModified: new Date('2021-01-31T00:00:00.000Z').toISOString(),
      }

      socket.emit(
        'removeNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: defaultNode,
        },
        (result: OperationResponse<IMmpClientNode | null>) => {
          expect(result.success).toEqual(true)
          done()
        }
      )
    })
  })

  describe('updateMap', () => {
    it(`allows request when modification secret is set`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'updateMap',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          map: {},
        },
        (result: boolean) => {
          expect(result).toEqual(true)
          done()
        }
      )
    })
  })

  describe('applyMapChangesByDiff', () => {
    it('updates the map based off of a diff', (done) => {
      socket = io('http://localhost:3000')
      const rootNodeId = crypto.randomUUID()

      const diff = {
        added: {},
        deleted: {},
        updated: {
          [rootNodeId]: {
            name: 'Thema',
          },
        },
      }

      socket.emit(
        'applyMapChangesByDiff',
        {
          mapId: map.id,
          diff,
          modificationSecret: map.modificationSecret,
        },
        (result: OperationResponse<unknown>) => {
          expect(result.success).toEqual(true)
          if (result.success) {
            expect(result.data).toEqual(diff)
          }
          done()
        }
      )
    })
  })

  describe('updateMapOptions', () => {
    it(`allows request when modification secret is set`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'updateMapOptions',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          options: {},
        },
        (result: MmpNode | undefined) => {
          expect(result).toEqual(true)
          done()
        }
      )
    })
  })

  describe('error handling in gateway methods', () => {
    it('addNodes returns CriticalErrorResponse when service throws error', (done) => {
      socket = io('http://localhost:3000')

      // Mock service to throw error
      jest
        .spyOn(mapsService, 'addNodesFromClient')
        .mockRejectedValueOnce(new Error('Database error'))

      socket.emit(
        'addNodes',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          nodes: [
            {
              name: 'test',
              coordinates: { x: 1, y: 2 },
              isRoot: true,
            },
          ],
        },
        (result: OperationResponse<IMmpClientNode[]>) => {
          expect(result.success).toEqual(false)
          if (!result.success) {
            expect(result.errorType).toEqual('critical')
          }
          done()
        }
      )
    })

    it('updateNode returns CriticalErrorResponse when service throws error', (done) => {
      socket = io('http://localhost:3000')

      // Mock service to throw error
      jest
        .spyOn(mapsService, 'updateNode')
        .mockRejectedValueOnce(new Error('Database error'))

      socket.emit(
        'updateNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: {
            id: crypto.randomUUID(),
            name: 'test',
            coordinates: { x: 1, y: 2 },
          },
          updatedProperty: 'name',
        },
        (result: OperationResponse<IMmpClientNode>) => {
          expect(result.success).toEqual(false)
          if (!result.success) {
            expect(result.errorType).toEqual('critical')
          }
          done()
        }
      )
    })

    it('applyMapChangesByDiff returns CriticalErrorResponse when service throws error', (done) => {
      socket = io('http://localhost:3000')

      // Mock service to throw error
      jest
        .spyOn(mapsService, 'updateMapByDiff')
        .mockRejectedValueOnce(new Error('Database error'))

      socket.emit(
        'applyMapChangesByDiff',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          diff: {
            added: {},
            updated: {},
            deleted: {},
          },
        },
        (result: OperationResponse<unknown>) => {
          expect(result.success).toEqual(false)
          if (!result.success) {
            expect(result.errorType).toEqual('critical')
            expect(result.code).toEqual('SERVER_ERROR')
          }
          done()
        }
      )
    })

    it('updateMap returns false when service throws error', (done) => {
      socket = io('http://localhost:3000')

      // Mock service to throw error
      jest
        .spyOn(mapsService, 'updateMap')
        .mockRejectedValueOnce(new Error('Database error'))

      socket.emit(
        'updateMap',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          map: {
            uuid: map.id,
            data: [],
          },
        },
        (result: boolean) => {
          expect(result).toEqual(false)
          done()
        }
      )
    })
  })

  describe('addNodes - additional OperationResponse handling', () => {
    it('returns SuccessResponse on successful node addition', (done) => {
      socket = io('http://localhost:3000')

      const mockNode = new MmpNode()
      mockNode.id = crypto.randomUUID()
      mockNode.nodeMapId = map.id
      mockNode.name = 'Test Node'

      jest
        .spyOn(mapsService, 'addNodesFromClient')
        .mockResolvedValueOnce([mockNode])

      socket.emit(
        'addNodes',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          nodes: [
            {
              id: mockNode.id,
              name: 'Test Node',
              coordinates: { x: 1, y: 2 },
              isRoot: true,
            },
          ],
        },
        (result: OperationResponse<IMmpClientNode[]>) => {
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data).toBeDefined()
            expect(Array.isArray(result.data)).toBe(true)
            expect(result.data.length).toBe(1)
          }
          done()
        }
      )
    })

    it('returns ValidationErrorResponse when validation fails', (done) => {
      socket = io('http://localhost:3000')

      jest.spyOn(mapsService, 'addNodesFromClient').mockResolvedValueOnce([])

      socket.emit(
        'addNodes',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          nodes: [
            {
              id: crypto.randomUUID(),
              name: 'Invalid Node',
              coordinates: { x: 1, y: 2 },
            },
          ],
        },
        (result: OperationResponse<IMmpClientNode[]>) => {
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.errorType).toBe('validation')
            expect(result.code).toBe('CONSTRAINT_VIOLATION')
          }
          done()
        }
      )
    })

    it('does not broadcast when validation error occurs', (done) => {
      socket = io('http://localhost:3000')

      jest.spyOn(mapsService, 'addNodesFromClient').mockResolvedValueOnce([])

      socket.emit(
        'addNodes',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          nodes: [
            {
              id: crypto.randomUUID(),
              name: 'Invalid Node',
              coordinates: { x: 1, y: 2 },
            },
          ],
        },
        (result: OperationResponse<IMmpClientNode[]>) => {
          expect(result.success).toBe(false)
          // Validation errors should not result in broadcast
          if (!result.success) {
            expect(result.errorType).toBe('validation')
          }
          done()
        }
      )
    })

    it('atomic operation: if one node fails, no nodes are created', (done) => {
      socket = io('http://localhost:3000')

      // Mock service to return a validation error (atomic failure)
      const validationError = {
        success: false as const,
        errorType: 'validation' as const,
        code: 'INVALID_PARENT' as const,
        message: 'VALIDATION_ERROR.INVALID_PARENT',
      }

      jest
        .spyOn(mapsService, 'addNodesFromClient')
        .mockResolvedValueOnce([validationError])

      // Mock exportMapToClient to return a valid map for fullMapState
      jest.spyOn(mapsService, 'exportMapToClient').mockResolvedValueOnce({
        uuid: map.id,
        data: [],
        options: {
          fontMaxSize: 24,
          fontMinSize: 10,
          fontIncrement: 2,
        },
        deletedAt: new Date(),
        deleteAfterDays: 30,
        lastModified: new Date(),
        lastAccessed: new Date(),
        createdAt: new Date(),
      })

      socket.emit(
        'addNodes',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          nodes: [
            {
              id: crypto.randomUUID(),
              name: 'Valid Node 1',
              coordinates: { x: 1, y: 2 },
              isRoot: true,
            },
            {
              id: crypto.randomUUID(),
              name: 'Invalid Node - Bad Parent',
              coordinates: { x: 2, y: 3 },
              parent: 'nonexistent-parent',
            },
            {
              id: crypto.randomUUID(),
              name: 'Valid Node 2',
              coordinates: { x: 3, y: 4 },
              isRoot: false,
            },
          ],
        },
        (result: OperationResponse<IMmpClientNode[]>) => {
          // The entire operation should fail
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.errorType).toBe('validation')
            expect(result.code).toBe('INVALID_PARENT')
            // Should include full map state for recovery
            expect(result.fullMapState).toBeDefined()
          }
          done()
        }
      )
    })
  })

  describe('updateNode - additional OperationResponse handling', () => {
    it('returns SuccessResponse on successful node update', (done) => {
      socket = io('http://localhost:3000')

      const mockNode = new MmpNode()
      mockNode.id = crypto.randomUUID()
      mockNode.nodeMapId = map.id
      mockNode.name = 'Updated Node'

      jest.spyOn(mapsService, 'updateNode').mockResolvedValueOnce(mockNode)

      socket.emit(
        'updateNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: {
            id: mockNode.id,
            name: 'Updated Node',
            coordinates: { x: 1, y: 2 },
          },
          updatedProperty: 'name',
        },
        (result: OperationResponse<IMmpClientNode>) => {
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data).toBeDefined()
            expect(result.data.id).toBe(mockNode.id)
          }
          done()
        }
      )
    })

    it('returns ValidationErrorResponse when service returns validation error', (done) => {
      socket = io('http://localhost:3000')

      const validationError = {
        success: false as const,
        errorType: 'validation' as const,
        code: 'INVALID_PARENT' as const,
        message: 'VALIDATION_ERROR.INVALID_PARENT',
      }

      jest
        .spyOn(mapsService, 'updateNode')
        .mockResolvedValueOnce(validationError)

      socket.emit(
        'updateNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: {
            id: crypto.randomUUID(),
            name: 'Test',
            coordinates: { x: 1, y: 2 },
            parent: 'invalid-parent',
          },
          updatedProperty: 'parent',
        },
        (result: OperationResponse<IMmpClientNode>) => {
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.errorType).toBe('validation')
            expect(result.code).toBe('INVALID_PARENT')
          }
          done()
        }
      )
    })

    it('does not broadcast when validation error occurs', (done) => {
      socket = io('http://localhost:3000')

      const nodeId = crypto.randomUUID()
      const validationError = {
        success: false as const,
        errorType: 'validation' as const,
        code: 'INVALID_PARENT' as const,
        message: 'VALIDATION_ERROR.INVALID_PARENT',
      }

      jest
        .spyOn(mapsService, 'updateNode')
        .mockResolvedValueOnce(validationError)

      socket.emit(
        'updateNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: {
            id: nodeId,
            name: 'Test',
            coordinates: { x: 1, y: 2 },
          },
          updatedProperty: 'name',
        },
        (result: OperationResponse<IMmpClientNode[]>) => {
          expect(result.success).toBe(false)
          // Validation errors should not result in broadcast
          if (!result.success) {
            expect(result.errorType).toBe('validation')
          }
          done()
        }
      )
    })

    it('returns CriticalErrorResponse when service throws error', (done) => {
      socket = io('http://localhost:3000')

      jest
        .spyOn(mapsService, 'updateNode')
        .mockRejectedValueOnce(new Error('Server error'))

      socket.emit(
        'updateNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: {
            id: crypto.randomUUID(),
            name: 'Test',
            coordinates: { x: 1, y: 2 },
          },
          updatedProperty: 'name',
        },
        (result: OperationResponse<IMmpClientNode>) => {
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.errorType).toBe('critical')
            expect(result.code).toBe('SERVER_ERROR')
          }
          done()
        }
      )
    })
  })

  afterEach(async () => {
    socket.close()
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })
})
