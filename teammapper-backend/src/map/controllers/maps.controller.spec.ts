import { Test, TestingModule } from '@nestjs/testing'
import MapsController from './maps.controller'
import { MapsService } from '../services/maps.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsGateway } from './yjs-gateway.service'
import { NotFoundException } from '@nestjs/common'
import { MmpMap } from '../entities/mmpMap.entity'
import { ClientMap, ClientPrivateMap } from '@teammapper/shared'
import { Request } from '../types'
import {
  createClientRootNode,
  createMmpClientMap,
  createMmpMap,
} from '../utils/tests/mapFactories'
import MalformedUUIDError from '../services/uuid.error'
import request from 'supertest'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ThrottlerModule } from '@nestjs/throttler'

describe('MapsController', () => {
  let mapsController: MapsController
  let mapsService: MapsService
  let yjsDocManager: YjsDocManagerService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
      controllers: [MapsController],
      providers: [
        {
          provide: MapsService,
          useValue: {
            findMap: jest.fn(),
            createEmptyMap: jest.fn(),
            duplicateMap: jest.fn(),
            exportMapToClient: jest.fn(),
            deleteMap: jest.fn(),
            updateLastAccessed: jest.fn(),
            getMapsOfUser: jest.fn(),
          },
        },
        {
          provide: YjsDocManagerService,
          useValue: { destroyDoc: jest.fn() },
        },
        {
          provide: YjsGateway,
          useValue: { closeConnectionsForMap: jest.fn() },
        },
      ],
    }).compile()

    mapsController = module.get<MapsController>(MapsController)
    mapsService = module.get<MapsService>(MapsService)
    yjsDocManager = module.get<YjsDocManagerService>(YjsDocManagerService)
  })

  describe('duplicate', () => {
    it('returns the duplicate the service creates', async () => {
      const oldMap = createMmpMap()
      const result: ClientPrivateMap = {
        map: createMmpClientMap(),
        adminId: 'new-admin-id',
        modificationSecret: 'new-modification-secret',
      }
      jest.spyOn(mapsService, 'duplicateMap').mockResolvedValueOnce(result)

      const response = await mapsController.duplicate(oldMap.id)

      expect(response).toEqual(result)
      expect(mapsService.duplicateMap).toHaveBeenCalledWith(oldMap.id)
    })

    it('throws NotFoundException if the old map does not exist', async () => {
      jest.spyOn(mapsService, 'duplicateMap').mockResolvedValueOnce(null)

      await expect(mapsController.duplicate(createMmpMap().id)).rejects.toThrow(
        NotFoundException
      )
    })

    it('throws NotFoundException if the map id is not a uuid', async () => {
      jest
        .spyOn(mapsService, 'duplicateMap')
        .mockRejectedValueOnce(new MalformedUUIDError('Invalid UUID'))

      await expect(mapsController.duplicate('test-map-id')).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe('findOne', () => {
    it('should find the correct map', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: ClientMap = createMmpClientMap({
        id: mapId,
      })
      const mmpMap = createMmpMap({ modificationSecret: null })

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(mmpMap)

      const response = await mapsController.findOne(mapId)

      expect(response).toEqual({ ...exportedMap, writable: true })
    })

    it("should throw a NotFoundException if the map wasn't found", async () => {
      const invalidMapId = 'map_id'

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockRejectedValueOnce(new MalformedUUIDError('MalformedUUIDError'))

      await expect(mapsController.findOne(invalidMapId)).rejects.toThrow(
        NotFoundException
      )
    })

    it('returns writable true when map has no modification secret', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: ClientMap = createMmpClientMap({ id: mapId })
      const mmpMap = createMmpMap({ modificationSecret: null })

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(mmpMap)

      const response = await mapsController.findOne(mapId)

      expect(response).toEqual({ ...exportedMap, writable: true })
    })

    it('returns writable true when correct secret is provided', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: ClientMap = createMmpClientMap({ id: mapId })
      const mmpMap = createMmpMap({ modificationSecret: 'my-secret' })

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(mmpMap)

      const response = await mapsController.findOne(mapId, 'my-secret')

      expect(response).toEqual({ ...exportedMap, writable: true })
    })

    it('returns writable false when wrong secret is provided', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: ClientMap = createMmpClientMap({ id: mapId })
      const mmpMap = createMmpMap({ modificationSecret: 'my-secret' })

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(mmpMap)

      const response = await mapsController.findOne(mapId, 'wrong-secret')

      expect(response).toEqual({ ...exportedMap, writable: false })
    })

    it('returns writable false when no secret is provided for protected map', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: ClientMap = createMmpClientMap({ id: mapId })
      const mmpMap = createMmpMap({ modificationSecret: 'my-secret' })

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(mmpMap)

      const response = await mapsController.findOne(mapId)

      expect(response).toEqual({ ...exportedMap, writable: false })
    })

    it('bumps lastAccessed for an authorized (writable) read', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: ClientMap = createMmpClientMap({ id: mapId })
      const mmpMap = createMmpMap({ modificationSecret: 'my-secret' })

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(mmpMap)

      await mapsController.findOne(mapId, 'my-secret')

      expect(mapsService.updateLastAccessed).toHaveBeenCalledWith(mapId)
    })

    it('does not bump lastAccessed for an anonymous read of a protected map', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: ClientMap = createMmpClientMap({ id: mapId })
      const mmpMap = createMmpMap({ modificationSecret: 'my-secret' })

      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(mmpMap)

      await mapsController.findOne(mapId)

      expect(mapsService.updateLastAccessed).not.toHaveBeenCalled()
    })
  })

  describe('findAll', () => {
    it('should return user maps when pid is provided', async () => {
      const pid = 'test-person-id'

      await mapsController.findAll({ pid } as Request)
      expect(mapsService.getMapsOfUser).toHaveBeenCalledWith(pid)
    })

    it('should return an empty array when pid is missing', async () => {
      const response = await mapsController.findAll({} as Request)
      expect(response).toEqual([])
    })

    it('should return an empty array when req is undefined', async () => {
      const response = await mapsController.findAll()
      expect(response).toEqual([])
    })
  })

  describe('delete', () => {
    it('should delete an existing map successfully', async () => {
      const existingMap = createMmpMap()

      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(existingMap)
      // We're not interested in testing the repository at this stage, only if the request gets past the admin ID check
      jest.spyOn(mapsService, 'deleteMap').mockResolvedValue(undefined)

      await mapsController.delete(existingMap.id, {
        adminId: existingMap.adminId,
      })

      expect(mapsService.deleteMap).toHaveBeenCalledWith(existingMap.id)
    })

    it('should not delete a map if the wrong admin ID is given', async () => {
      const existingMap: MmpMap = createMmpMap()

      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(existingMap)

      await mapsController.delete(existingMap.id, {
        adminId: 'wrong-admin-id',
      })

      expect(mapsService.deleteMap).not.toHaveBeenCalledWith(existingMap.id)
    })

    it('deletes the DB row before destroying the in-memory Y.Doc', async () => {
      const existingMap = createMmpMap()
      const callOrder: string[] = []

      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(existingMap)
      jest.spyOn(mapsService, 'deleteMap').mockImplementation(async () => {
        callOrder.push('deleteMap')
      })
      jest.spyOn(yjsDocManager, 'destroyDoc').mockImplementation(() => {
        callOrder.push('destroyDoc')
      })

      await mapsController.delete(existingMap.id, {
        adminId: existingMap.adminId,
      })

      expect(callOrder).toEqual(['deleteMap', 'destroyDoc'])
    })
  })

  describe('create', () => {
    it('should create a new map if given a root node', async () => {
      const newMap: MmpMap = createMmpMap()

      const exportedMap: ClientMap = createMmpClientMap({
        uuid: newMap.id,
      })

      const result: ClientPrivateMap = {
        map: exportedMap,
        adminId: 'admin-id',
        modificationSecret: 'modification-secret',
      }

      const rootNode = createClientRootNode()

      jest.spyOn(mapsService, 'createEmptyMap').mockResolvedValueOnce(newMap)
      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)

      const response = await mapsController.create({
        rootNode,
      })

      expect(mapsService.createEmptyMap).toHaveBeenCalledWith(
        rootNode,
        undefined
      )
      expect(response).toEqual(result)
    })

    it('should create a new map with a specified pid', async () => {
      const pid = 'test-person-id'

      const newMap: MmpMap = createMmpMap({ ownerExternalId: pid })
      const exportedMap: ClientMap = createMmpClientMap({ uuid: newMap.id })

      const result: ClientPrivateMap = {
        map: exportedMap,
        adminId: 'admin-id',
        modificationSecret: 'modification-secret',
      }

      const rootNode = createClientRootNode()

      jest.spyOn(mapsService, 'createEmptyMap').mockResolvedValueOnce(newMap)
      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)

      const response = await mapsController.create({ rootNode }, {
        pid,
      } as Request)

      expect(mapsService.createEmptyMap).toHaveBeenCalledWith(rootNode, pid)
      expect(response).toEqual(result)
    })
  })
})

// HTTP-layer regression tests: exercise the real request pipeline so that
// JSON body → schema validation → controller wiring is verified against the
// exact wire format the frontend produces. The unit tests above call the
// controller method directly and so cannot catch wire-format drift.
describe('MapsController (HTTP wire contract)', () => {
  let app: NestExpressApplication
  let mapsService: MapsService

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
      controllers: [MapsController],
      providers: [
        {
          provide: MapsService,
          useValue: {
            findMap: jest.fn(),
            createEmptyMap: jest.fn(),
            duplicateMap: jest.fn(),
            exportMapToClient: jest.fn(),
            deleteMap: jest.fn(),
          },
        },
        {
          provide: YjsDocManagerService,
          useValue: { destroyDoc: jest.fn() },
        },
        {
          provide: YjsGateway,
          useValue: { closeConnectionsForMap: jest.fn() },
        },
      ],
    }).compile()

    app = module.createNestApplication<NestExpressApplication>()
    app.set('trust proxy', true)
    await app.init()
    mapsService = module.get<MapsService>(MapsService)
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shares the duplication rate allowance across source maps without requiring an IP identity', async () => {
    const source = createMmpMap()
    const target = createMmpMap()
    jest
      .spyOn(mapsService, 'duplicateMap')
      .mockResolvedValue(null)
      .mockResolvedValueOnce({
        map: createMmpClientMap(),
        adminId: target.adminId,
        modificationSecret: target.modificationSecret,
      })
    const response = await request(app.getHttpServer())
      .post(`/api/maps/${source.id}/duplicate`)
      .set('X-Forwarded-For', '192.0.2.1')
      .expect(201)
    expect(response.body.modificationSecret).toBe(target.modificationSecret)
    for (let index = 0; index < 4; index++) {
      await request(app.getHttpServer())
        .post(`/api/maps/source-${index}/duplicate`)
        .set('X-Forwarded-For', `192.0.2.${index + 2}`)
        .expect(404)
    }
    await request(app.getHttpServer())
      .post('/api/maps/another-source/duplicate')
      .set('X-Forwarded-For', '192.0.2.6')
      .expect(429)
    expect(mapsService.duplicateMap).toHaveBeenCalledTimes(5)
  })

  describe('DELETE /api/maps/:id', () => {
    it('accepts the body the frontend actually sends ({ adminId } only)', async () => {
      const existingMap = createMmpMap()
      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(existingMap)
      jest.spyOn(mapsService, 'deleteMap').mockResolvedValueOnce(undefined)

      await request(app.getHttpServer())
        .delete(`/api/maps/${existingMap.id}`)
        .send({ adminId: existingMap.adminId })
        .expect(200)

      expect(mapsService.deleteMap).toHaveBeenCalledWith(existingMap.id)
    })

    it('returns 400 when the body omits adminId', async () => {
      await request(app.getHttpServer())
        .delete('/api/maps/any-id')
        .send({})
        .expect(400)

      expect(mapsService.deleteMap).not.toHaveBeenCalled()
    })

    it('rejects adminId=null so legacy NULL-admin rows are not deletable', async () => {
      await request(app.getHttpServer())
        .delete('/api/maps/any-id')
        .send({ adminId: null })
        .expect(400)

      expect(mapsService.deleteMap).not.toHaveBeenCalled()
    })
  })
})
