import { Test, TestingModule } from '@nestjs/testing'
import MapsController from './maps.controller'
import { MapsService } from '../services/maps.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsGateway } from './yjs-gateway.service'
import { INestApplication, NotFoundException } from '@nestjs/common'
import { MmpMap } from '../entities/mmpMap.entity'
import { IMmpClientMap, IMmpClientPrivateMap, Request } from '../types'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  createClientRootNode,
  createMmpClientMap,
  createMmpMap,
} from '../utils/tests/mapFactories'
import MalformedUUIDError from '../services/uuid.error'
import request from 'supertest'

describe('MapsController', () => {
  let mapsController: MapsController
  let mapsService: MapsService
  let yjsDocManager: YjsDocManagerService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MapsController],
      providers: [
        {
          provide: MapsService,
          useValue: {
            findMap: jest.fn(),
            createEmptyMap: jest.fn(),
            findNodes: jest.fn(),
            addNodes: jest.fn(),
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
    it('should duplicate a map correctly', async () => {
      const oldMap: MmpMap = createMmpMap({
        adminId: 'old-admin-id',
        modificationSecret: 'old-modification-secret',
      })
      const newMap: MmpMap = createMmpMap({
        adminId: 'new-admin-id',
        modificationSecret: 'new-modification-secret',
      })
      const exportedMap: IMmpClientMap = createMmpClientMap()
      const result: IMmpClientPrivateMap = {
        map: exportedMap,
        adminId: 'new-admin-id',
        modificationSecret: 'new-modification-secret',
      }

      jest.spyOn(mapsService, 'findMap').mockResolvedValueOnce(oldMap)
      jest.spyOn(mapsService, 'createEmptyMap').mockResolvedValueOnce(newMap)
      jest
        .spyOn(mapsService, 'findNodes')
        .mockResolvedValueOnce(Array<MmpNode>())
      jest.spyOn(mapsService, 'addNodes').mockResolvedValueOnce([])
      jest
        .spyOn(mapsService, 'exportMapToClient')
        .mockResolvedValueOnce(exportedMap)

      const response = await mapsController.duplicate(oldMap.id)

      expect(response).toEqual(result)

      expect(newMap.name).toEqual(oldMap.name)
      expect(newMap.lastModified).toEqual(oldMap.lastModified)
    })

    it('should throw NotFoundException if old map is not found', async () => {
      const mapId = 'test-map-id'

      jest
        .spyOn(mapsService, 'findMap')
        .mockRejectedValueOnce(new Error('MalformedUUIDError'))

      await expect(mapsController.duplicate(mapId)).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe('findOne', () => {
    it('should find the correct map', async () => {
      const mapId = 'e7f66b65-ffd5-4387-b645-35f8e794c7e7'
      const exportedMap: IMmpClientMap = createMmpClientMap({
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
      const exportedMap: IMmpClientMap = createMmpClientMap({ id: mapId })
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
      const exportedMap: IMmpClientMap = createMmpClientMap({ id: mapId })
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
      const exportedMap: IMmpClientMap = createMmpClientMap({ id: mapId })
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
      const exportedMap: IMmpClientMap = createMmpClientMap({ id: mapId })
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
      const exportedMap: IMmpClientMap = createMmpClientMap({ id: mapId })
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
      const exportedMap: IMmpClientMap = createMmpClientMap({ id: mapId })
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

      const exportedMap: IMmpClientMap = createMmpClientMap({
        uuid: newMap.id,
      })

      const result: IMmpClientPrivateMap = {
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
      const exportedMap: IMmpClientMap = createMmpClientMap({ uuid: newMap.id })

      const result: IMmpClientPrivateMap = {
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
  let app: INestApplication
  let mapsService: MapsService

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MapsController],
      providers: [
        {
          provide: MapsService,
          useValue: {
            findMap: jest.fn(),
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

    app = module.createNestApplication()
    await app.init()
    mapsService = module.get<MapsService>(MapsService)
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    jest.clearAllMocks()
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
