import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { MmpMap } from 'src/map/entities/mmpMap.entity'
import { MmpNode } from 'src/map/entities/mmpNode.entity'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConfigModule } from '@nestjs/config'
import { io, Socket } from 'socket.io-client'
import { IMmpClientMap } from 'src/map/types'
import { createTestConfiguration, destroyWorkerDatabase } from './db'
import AppModule from '../src/app.module'

describe('AppController (e2e)', () => {
  let app: INestApplication
  let server: any
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
    server = app.getHttpServer()
    await app.init()
    await app.listen(3001)
  })

  afterAll(async () => {
    // close connection:
    await destroyWorkerDatabase(
      mapRepo.manager.connection,
      process.env.JEST_WORKER_ID || ''
    )
    await app.close()
  })

  it('/api/maps/:id(GET)', async () => {
    const map: MmpMap = await mapRepo.save({ name: 'test' })
    await nodesRepo.save({
      nodeMapId: map.id,
      coordinatesX: 3,
      coordinatesY: 1,
    })
    const response: request.Response = await request(server).get(
      `/api/maps/${map.id}`
    )
    expect(response.body.uuid).toEqual(map.id)
  })

  describe('WebSocketGateway', () => {
    let socket: Socket

    beforeEach(async () => {
      socket = io('http://localhost:3001')
    })

    afterEach(async () => {
      socket.close()
    })

    it('lets a user join a map session', (done) => {
      mapRepo.save({}).then((map) => {
        socket.emit(
          'join',
          { mapId: map.id, color: '#FFFFFF' },
          (result: IMmpClientMap) => {
            expect(result).toBeInstanceOf(Object)
            done()
          }
        )
      })
    })

    it('lets a user update a map', async () => {
      const modificationSecret = crypto.randomUUID()

      const oldMap = await mapRepo.save({
        modificationSecret: modificationSecret,
      })

      const map: IMmpClientMap = {
        uuid: oldMap.id,
        lastModified: new Date(),
        lastAccessed: new Date(),
        deleteAfterDays: 30,
        deletedAt: new Date(),
        options: { fontMaxSize: 10, fontMinSize: 15, fontIncrement: 2 },
        createdAt: new Date(),
        data: [
          {
            name: 'test',
            coordinates: { x: 1.1, y: 2.2 },
            detached: false,
            font: { style: '', size: 5, weight: '' },
            colors: { branch: '', background: '', name: '' },
            image: { size: 60, src: '' },
            parent: '',
            k: -15.361675447001142,
            id: modificationSecret,
            link: { href: '' },
            locked: false,
            isRoot: true,
          },
        ],
      }
      socket.emit(
        'updateMap',
        {
          map,
          mapId: map.uuid,
          modificationSecret: modificationSecret,
        },
        async () => {
          const mapInDb = await mapRepo.findOne({
            where: { id: map.uuid },
          })
          expect(mapInDb?.id).toEqual(map.uuid)
        }
      )
    })

    it('notifies a user about a new node', (done) => {
      socket.on('nodesAdded', (result: any) => {
        expect(result.nodes[0].name).toEqual('test')
        done()
      })

      const mapId = crypto.randomUUID()

      mapRepo
        .save({
          id: mapId,
          modificationSecret: mapId,
        })
        .then((map) => {
          socket.emit('join', { mapId: map.id, color: '#FFFFFF' }, () => {
            socket.emit('addNodes', {
              mapId: map.id,
              modificationSecret: map.modificationSecret,
              nodes: [
                {
                  name: 'test',
                  coordinates: { x: 1, y: 2 },
                  font: {},
                  colors: {},
                  link: {},
                  isRoot: true,
                  detached: false,
                },
              ],
            })
          })
        })
    })

    it('notifies a user about a node update', (done) => {
      const mapId = crypto.randomUUID()
      const nodeId = crypto.randomUUID()

      socket.on('nodeUpdated', (result: any) => {
        expect(result.property).toEqual('nodeName')
        expect(result.node.id).toEqual(nodeId)
        expect(result.node.coordinates.x).toEqual(3)
        done()
      })

      mapRepo
        .save({
          id: mapId,
          modificationSecret: mapId,
          nodes: [
            nodesRepo.create({
              id: nodeId,
              coordinatesX: 1,
              coordinatesY: 2,
              nodeMapId: mapId,
              detached: false,
              root: true,
            }),
          ],
        })
        .then((map) => {
          socket.emit('join', { mapId: map.id, color: '#FFFFFF' }, () => {
            socket.emit('updateNode', {
              mapId: map.id,
              modificationSecret: map.modificationSecret,
              updatedProperty: 'nodeName',
              node: {
                id: nodeId,
                name: 'test',
                coordinates: { x: 3, y: 4 },
                font: {},
                colors: {},
                link: {},
                detached: false,
                root: true,
              },
            })
          })
        })
    })
  })
})
