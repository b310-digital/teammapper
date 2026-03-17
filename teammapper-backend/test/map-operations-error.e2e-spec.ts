import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { MmpMap } from '../src/map/entities/mmpMap.entity'
import { MmpNode } from '../src/map/entities/mmpNode.entity'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConfigModule } from '@nestjs/config'
import { io, Socket } from 'socket.io-client'
import {
  OperationResponse,
  ValidationErrorResponse,
  IMmpClientNode,
} from '../src/map/types'
import { createTestConfiguration, destroyWorkerDatabase } from './db'
import AppModule from '../src/app.module'

// Using IMmpClientNode as the return type for node operations
type ExportNodeProperties = IMmpClientNode

const crypto = require('crypto') // eslint-disable-line @typescript-eslint/no-require-imports

describe('Map Operations Error Handling (e2e)', () => {
  let app: INestApplication
  let nodesRepo: Repository<MmpNode>
  let mapRepo: Repository<MmpMap>

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(
          await createTestConfiguration(process.env.JEST_WORKER_ID || '')
        ),
        AppModule,
      ],
    }).compile()

    nodesRepo = moduleFixture.get<Repository<MmpNode>>(
      getRepositoryToken(MmpNode)
    )
    mapRepo = moduleFixture.get<Repository<MmpMap>>(getRepositoryToken(MmpMap))
    app = moduleFixture.createNestApplication()
    await app.init()
    await app.listen(3002)
  })

  afterAll(async () => {
    await destroyWorkerDatabase(
      mapRepo.manager.connection,
      process.env.JEST_WORKER_ID || ''
    )
    await app.close()
  })

  describe('addNodes - ValidationErrorResponse structure', () => {
    let socket: Socket

    beforeEach(() => {
      socket = io('http://localhost:3002')
    })

    afterEach(() => {
      socket.close()
    })

    it('returns ValidationErrorResponse for invalid parent', (done) => {
      const mapId = crypto.randomUUID()
      const rootNodeId = crypto.randomUUID()
      const modificationSecret = crypto.randomUUID()

      mapRepo
        .save({
          id: mapId,
          modificationSecret: modificationSecret,
        })
        .then(() => {
          return nodesRepo.save({
            id: rootNodeId,
            nodeMapId: mapId,
            root: true,
            detached: false,
            coordinatesX: 0,
            coordinatesY: 0,
          })
        })
        .then(() => {
          socket.emit('join', { mapId, color: '#FFFFFF' }, () => {
            socket.emit(
              'addNodes',
              {
                mapId: mapId,
                modificationSecret: modificationSecret,
                nodes: [
                  {
                    id: crypto.randomUUID(),
                    name: 'Invalid Node',
                    coordinates: { x: 1, y: 2 },
                    parent: '99999999-9999-9999-9999-999999999999',
                    isRoot: false,
                    detached: false,
                  },
                ],
              },
              (response: OperationResponse<ExportNodeProperties[]>) => {
                // Socket.io acknowledgment contains ValidationErrorResponse structure
                if (response.success === false) {
                  const validationError = response as ValidationErrorResponse
                  expect(validationError.errorType).toBe('validation')
                  expect(validationError.code).toBeDefined()
                  expect(validationError.message).toBeDefined()
                  done()
                } else {
                  done.fail('Expected validation error response')
                }
              }
            )
          })
        })
    })

    it('returns SuccessResponse structure on successful operation', (done) => {
      const mapId = crypto.randomUUID()
      const modificationSecret = crypto.randomUUID()

      mapRepo
        .save({
          id: mapId,
          modificationSecret: modificationSecret,
        })
        .then((map) => {
          socket.emit('join', { mapId: map.id, color: '#FFFFFF' }, () => {
            socket.emit(
              'addNodes',
              {
                mapId: map.id,
                modificationSecret: map.modificationSecret,
                nodes: [
                  {
                    id: crypto.randomUUID(),
                    name: 'Valid Node',
                    coordinates: { x: 1, y: 2 },
                    isRoot: true,
                    detached: false,
                  },
                ],
              },
              (response: OperationResponse<ExportNodeProperties[]>) => {
                // Successful operations return SuccessResponse structure
                expect(response.success).toBe(true)
                if (response.success) {
                  expect(response.data).toBeDefined()
                  expect(Array.isArray(response.data)).toBe(true)
                }
                done()
              }
            )
          })
        })
    })
  })

  describe('updateNode - ValidationErrorResponse structure', () => {
    let socket: Socket

    beforeEach(() => {
      socket = io('http://localhost:3002')
    })

    afterEach(() => {
      socket.close()
    })

    it('returns ValidationErrorResponse for invalid parent update', (done) => {
      const mapId = crypto.randomUUID()
      const nodeId = crypto.randomUUID()
      const modificationSecret = crypto.randomUUID()

      mapRepo
        .save({
          id: mapId,
          modificationSecret: modificationSecret,
        })
        .then(() => {
          return nodesRepo.save({
            id: nodeId,
            nodeMapId: mapId,
            root: true,
            detached: false,
            coordinatesX: 1,
            coordinatesY: 2,
          })
        })
        .then(() => {
          socket.emit('join', { mapId, color: '#FFFFFF' }, () => {
            socket.emit(
              'updateNode',
              {
                mapId: mapId,
                modificationSecret: modificationSecret,
                updatedProperty: 'parent',
                node: {
                  id: nodeId,
                  name: 'Updated Node',
                  coordinates: { x: 3, y: 4 },
                  parent: '99999999-9999-9999-9999-999999999999',
                  isRoot: false,
                  detached: false,
                },
              },
              (response: OperationResponse<ExportNodeProperties>) => {
                // Socket.io acknowledgment contains ValidationErrorResponse structure
                if (response.success === false) {
                  const validationError = response as ValidationErrorResponse
                  expect(validationError.errorType).toBe('validation')
                  // updateNode returns CONSTRAINT_VIOLATION for invalid parent
                  expect(validationError.code).toBe('CONSTRAINT_VIOLATION')
                  done()
                } else {
                  done.fail('Expected validation error response')
                }
              }
            )
          })
        })
    })

    it('returns SuccessResponse structure on successful update', (done) => {
      const mapId = crypto.randomUUID()
      const nodeId = crypto.randomUUID()
      const modificationSecret = crypto.randomUUID()

      mapRepo
        .save({
          id: mapId,
          modificationSecret: modificationSecret,
        })
        .then(() => {
          return nodesRepo.save({
            id: nodeId,
            nodeMapId: mapId,
            root: true,
            detached: false,
            coordinatesX: 1,
            coordinatesY: 2,
          })
        })
        .then(() => {
          socket.emit('join', { mapId, color: '#FFFFFF' }, () => {
            socket.emit(
              'updateNode',
              {
                mapId: mapId,
                modificationSecret: modificationSecret,
                updatedProperty: 'name',
                node: {
                  id: nodeId,
                  name: 'Successfully Updated',
                  coordinates: { x: 1, y: 2 },
                  root: true,
                  detached: false,
                },
              },
              (response: OperationResponse<ExportNodeProperties>) => {
                // Successful operations return SuccessResponse structure
                expect(response.success).toBe(true)
                if (response.success) {
                  expect(response.data).toBeDefined()
                  expect(response.data.id).toBe(nodeId)
                  expect(response.data.name).toBe('Successfully Updated')
                }
                done()
              }
            )
          })
        })
    })
  })
})
