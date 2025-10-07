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

      // Date objects are serialised to JSON in the result, so we'll need to be explicit in setting these here
      const defaultNode = {
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
        (result: MmpNode | undefined) => {
          expect(result).toEqual(defaultNode)
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
        (result: boolean) => {
          expect(result).toEqual(true)
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
    it('addNodes returns false when service throws error', (done) => {
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
        (result: boolean) => {
          expect(result).toEqual(false)
          done()
        }
      )
    })

    it('updateNode returns false when service throws error', (done) => {
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
        },
        (result: boolean) => {
          expect(result).toEqual(false)
          done()
        }
      )
    })

    it('applyMapChangesByDiff returns false when service throws error', (done) => {
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
        (result: boolean) => {
          expect(result).toEqual(false)
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

  afterEach(async () => {
    socket.close()
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })
})
