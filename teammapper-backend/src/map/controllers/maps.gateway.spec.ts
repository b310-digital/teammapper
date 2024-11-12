import { INestApplication } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Test } from '@nestjs/testing'
import { Repository } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { io, Socket } from 'socket.io-client'
import { MmpMap } from '../entities/mmpMap.entity'
import { MapsService } from '../services/maps.service'
import { MapsGateway } from './maps.gateway'
import { MmpNode } from '../entities/mmpNode.entity'
import { createMock } from '@golevelup/ts-jest'
import { IMmpClientNode } from '../types'
import { createMmpMap } from '../utils/tests/mapFactories'

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
          resolve(new MmpNode())
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
    it(`will return false if no new nodes are being added`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'addNodes',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          nodes: [{}],
        },
        (result: boolean) => {
          expect(result).toEqual(false)
          done()
        }
      )
    })
  })

  describe('updateNode', () => {
    it(`allows request when modification secret is set`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'updateNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: {},
        },
        (result: boolean) => {
          expect(result).toEqual(true)
          done()
        }
      )
    })
  })

  describe('removeNode', () => {
    it(`allows request when modification secret is set`, (done) => {
      socket = io('http://localhost:3000')

      socket.emit(
        'removeNode',
        {
          mapId: map.id,
          modificationSecret: map.modificationSecret,
          node: {},
        },
        (result: MmpNode | undefined) => {
          expect(result).toEqual({})
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
      const localMap = createMmpMap()
      const rootNodeId = crypto.randomUUID()

      const diff = {
        "added": {},
        "deleted": {},
        "updated": {
          [rootNodeId]: {
            "name": "Thema"
          }
        }
      }

      socket.emit(
        'applyMapChangesByDiff',
        {
          mapId: map.id,
          diff,
          modificationSecret: map.modificationSecret
        },
        (result: boolean) => {
          expect(result).toEqual(true);
          done();
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

  afterEach(async () => {
    socket.close()
  })

  afterAll(async () => {
    await app.close()
  })
})
