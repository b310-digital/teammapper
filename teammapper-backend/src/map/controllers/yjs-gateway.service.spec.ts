import { YjsGateway } from './yjs-gateway.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsPersistenceService } from '../services/yjs-persistence.service'
import { MapsService } from '../services/maps.service'
import { WsConnectionLimiterService } from '../services/ws-connection-limiter.service'
import configService from '../../config.service'
import {
  WS_CLOSE_MAP_SYNC_RESET,
  YJS_SECRET_SUBPROTOCOL_PREFIX,
  YJS_SUBPROTOCOL,
} from '@teammapper/shared'
import { MmpMap } from '../entities/mmpMap.entity'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import { jest } from '@jest/globals'
import { createServer } from 'http'
import type { IncomingMessage, Server } from 'http'
import type { AddressInfo } from 'net'
import type { HttpAdapterHost } from '@nestjs/core'
import {
  WS_CLOSE_MISSING_PARAM,
  WS_CLOSE_MAP_DELETED,
  WS_CLOSE_MAP_NOT_FOUND,
  WS_CLOSE_TRY_AGAIN,
  CONNECTION_SETUP_TIMEOUT_MS,
  MESSAGE_SYNC,
  encodeSyncUpdateMessage,
  encodeSyncStep1Message,
} from '../utils/yjsProtocol'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const createMockMap = (secret: string | null = 'test-secret'): MmpMap => {
  const map = new MmpMap()
  map.id = 'map-1'
  map.name = 'Test Map'
  map.modificationSecret = secret
  map.options = { fontMaxSize: 28, fontMinSize: 6, fontIncrement: 2 }
  return map
}

interface MockWs {
  on: jest.Mock<(event: string, handler: WsEventHandler) => void>
  close: jest.Mock
  send: jest.Mock<(data: Uint8Array, cb?: (err?: Error) => void) => void>
  terminate: jest.Mock
  ping: jest.Mock
  readyState: number
  _triggerClose: () => void
  _triggerMessage: (data: Uint8Array) => void
  _triggerError: (error: Error) => void
  _triggerPong: () => void
}

type WsEventHandler = (...args: unknown[]) => void

const createMockWs = (): MockWs => {
  const handlers = new Map<string, WsEventHandler[]>()
  return {
    on: jest.fn((event: string, handler: WsEventHandler) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event)!.push(handler)
    }),
    close: jest.fn(),
    send: jest.fn((_data: Uint8Array, cb?: (err?: Error) => void) => {
      if (cb) cb()
    }),
    terminate: jest.fn(),
    ping: jest.fn(),
    readyState: WebSocket.OPEN,
    _triggerClose: () => {
      handlers.get('close')?.forEach((h) => h())
    },
    _triggerMessage: (data: Uint8Array) => {
      handlers.get('message')?.forEach((h) => h(Buffer.from(data)))
    },
    _triggerError: (error: Error) => {
      handlers.get('error')?.forEach((h) => h(error))
    },
    _triggerPong: () => {
      handlers.get('pong')?.forEach((h) => h())
    },
  }
}

// Builds the request of a current client, which offers the modification
// secret as a subprotocol next to `YJS_SUBPROTOCOL`, as the browser sends
// the `protocols` argument of its `WebSocket` constructor
const createMockRequest = (
  mapId: string | null,
  secret: string | null = null,
  ip: string = '127.0.0.1'
): IncomingMessage => {
  const params = new URLSearchParams()
  if (mapId) params.set('mapId', mapId)
  const offer = secret
    ? `${YJS_SUBPROTOCOL}, ${YJS_SECRET_SUBPROTOCOL_PREFIX}${secret}`
    : YJS_SUBPROTOCOL
  return {
    url: `/yjs?${params.toString()}`,
    socket: { remoteAddress: ip },
    headers: { 'sec-websocket-protocol': offer },
  } as unknown as IncomingMessage
}

// Triggers the private handleConnection method — the WebSocket 'connection'
// event is the natural entry point and cannot be reached through public API
// in a unit test without a real HTTP server.
const connectClient = async (
  gateway: YjsGateway,
  ws: MockWs,
  req: IncomingMessage
) => {
  const handler = gateway as unknown as {
    handleConnection(ws: MockWs, req: IncomingMessage): Promise<void>
  }
  await handler.handleConnection(ws, req)
}

describe('YjsGateway', () => {
  let gateway: YjsGateway
  let mapsService: jest.Mocked<MapsService>
  let docManager: jest.Mocked<YjsDocManagerService>
  let limiter: jest.Mocked<WsConnectionLimiterService>
  let doc: Y.Doc
  let persistenceService: jest.Mocked<YjsPersistenceService>

  beforeEach(() => {
    doc = new Y.Doc()

    mapsService = {
      findMap: jest.fn<MapsService['findMap']>(),
    } as unknown as jest.Mocked<MapsService>

    docManager = {
      getOrCreateDoc: jest
        .fn<YjsDocManagerService['getOrCreateDoc']>()
        .mockResolvedValue(doc),
      getDoc: jest.fn<YjsDocManagerService['getDoc']>().mockReturnValue(doc),
      notifyClientCount: jest
        .fn<YjsDocManagerService['notifyClientCount']>()
        .mockResolvedValue(undefined),
      destroyDoc: jest
        .fn<YjsDocManagerService['destroyDoc']>()
        .mockImplementation(() => {
          doc.destroy()
          docManager.getDoc.mockReturnValue(undefined)
        }),
      hasDoc: jest.fn<YjsDocManagerService['hasDoc']>().mockReturnValue(true),
      restoreGraceTimer: jest.fn(),
    } as unknown as jest.Mocked<YjsDocManagerService>

    persistenceService = {
      registerDebounce: jest.fn(),
      unregisterDebounce: jest.fn(),
    } as unknown as jest.Mocked<YjsPersistenceService>

    limiter = {
      checkLimits: jest.fn().mockReturnValue(null),
      releaseConnection: jest.fn(),
      cleanupExpiredRateWindows: jest.fn(),
      getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
      reset: jest.fn(),
      onModuleDestroy: jest.fn(),
    } as unknown as jest.Mocked<WsConnectionLimiterService>

    const httpAdapterHost: Pick<HttpAdapterHost, 'httpAdapter'> = {
      httpAdapter: {
        getHttpServer: jest.fn().mockReturnValue({ on: jest.fn() }),
      } as unknown as HttpAdapterHost['httpAdapter'],
    }

    gateway = new YjsGateway(
      httpAdapterHost as HttpAdapterHost,
      docManager,
      persistenceService,
      mapsService,
      limiter
    )
  })

  afterEach(() => {
    gateway.onModuleDestroy()
    doc.destroy()
    jest.restoreAllMocks()
  })

  // ─── Connection setup ──────────────────────────────────────

  describe('connection setup', () => {
    it('syncs full doc state to client on connection', async () => {
      doc.getMap('nodes').set('node-1', new Y.Map())
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      const clientDoc = new Y.Doc()
      for (const call of ws.send.mock.calls) {
        const data = new Uint8Array(call[0] as Buffer)
        const decoder = decoding.createDecoder(data)
        if (decoding.readVarUint(decoder) === MESSAGE_SYNC) {
          const encoder = encoding.createEncoder()
          syncProtocol.readSyncMessage(decoder, encoder, clientDoc, null)
        }
      }

      expect(clientDoc.getMap('nodes').has('node-1')).toBe(true)
      clientDoc.destroy()
    })

    it('does not send a write-access message over WebSocket', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      const messageTypes = ws.send.mock.calls.map((call) => {
        const data = new Uint8Array(call[0] as Buffer)
        return decoding.readVarUint(decoding.createDecoder(data))
      })

      expect(messageTypes).not.toContain(4)
      expect(messageTypes[0]).toBe(MESSAGE_SYNC)
    })

    it('closes and cleans up when map not found', async () => {
      mapsService.findMap.mockResolvedValue(null)
      limiter.getClientIp.mockReturnValue('10.0.0.1')
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('nonexistent'))

      expect(ws.close).toHaveBeenCalledWith(
        WS_CLOSE_MAP_NOT_FOUND,
        'Map not found'
      )
      expect(limiter.releaseConnection).toHaveBeenCalledWith('10.0.0.1')
    })

    it('closes and cleans up when mapId missing', async () => {
      limiter.getClientIp.mockReturnValue('10.0.0.1')
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest(null))

      expect(ws.close).toHaveBeenCalledWith(
        WS_CLOSE_MISSING_PARAM,
        'Missing mapId'
      )
      expect(limiter.releaseConnection).toHaveBeenCalledWith('10.0.0.1')
    })

    it('closes with 1013 when setup exceeds timeout', async () => {
      jest.useFakeTimers()
      mapsService.findMap.mockReturnValue(new Promise(() => {}))
      const ws = createMockWs()

      const promise = connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )
      jest.advanceTimersByTime(CONNECTION_SETUP_TIMEOUT_MS + 1)
      await promise

      expect(ws.close).toHaveBeenCalledWith(
        WS_CLOSE_TRY_AGAIN,
        'Connection setup timeout'
      )
      expect(limiter.releaseConnection).toHaveBeenCalledWith('127.0.0.1')
      jest.useRealTimers()
    })
  })

  // ─── Write access control ──────────────────────────────────

  describe('write access control', () => {
    it('drops writes from read-only client', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap('secret-123'))
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'wrong-secret')
      )
      doc.getMap('nodes').set('existing', new Y.Map())
      const initialSize = doc.getMap('nodes').size

      const clientDoc = new Y.Doc()
      clientDoc.getMap('nodes').set('new-node', new Y.Map())
      ws._triggerMessage(
        encodeSyncUpdateMessage(Y.encodeStateAsUpdate(clientDoc))
      )

      expect(doc.getMap('nodes').size).toBe(initialSize)
      clientDoc.destroy()
    })

    it('applies writes from client with correct secret', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap('secret-123'))
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('map-1', 'secret-123'))

      const clientDoc = new Y.Doc()
      clientDoc.getMap('nodes').set('new-node', new Y.Map())
      ws._triggerMessage(
        encodeSyncUpdateMessage(Y.encodeStateAsUpdate(clientDoc))
      )

      expect(doc.getMap('nodes').has('new-node')).toBe(true)
      clientDoc.destroy()
    })

    it('grants write access when map has no secret', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap(null))
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('map-1'))

      const clientDoc = new Y.Doc()
      clientDoc.getMap('nodes').set('new-node', new Y.Map())
      ws._triggerMessage(
        encodeSyncUpdateMessage(Y.encodeStateAsUpdate(clientDoc))
      )

      expect(doc.getMap('nodes').has('new-node')).toBe(true)
      clientDoc.destroy()
    })

    // Sends an update that adds a node, and reports whether the server kept it
    const serverAppliesWrite = (ws: MockWs): boolean => {
      const clientDoc = new Y.Doc()
      clientDoc.getMap('nodes').set('new-node', new Y.Map())
      ws._triggerMessage(
        encodeSyncUpdateMessage(Y.encodeStateAsUpdate(clientDoc))
      )
      clientDoc.destroy()
      return doc.getMap('nodes').has('new-node')
    }

    it('ignores a secret in the query param', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap('secret-123'))
      const ws = createMockWs()
      const req = createMockRequest('map-1')
      req.url = '/yjs?mapId=map-1&secret=secret-123'

      await connectClient(gateway, ws, req)

      expect(serverAppliesWrite(ws)).toBe(false)
    })
  })

  // Cover updates adding a top-level map absent from the schema, plus size and
  // rate limits. Invalid map data must be discarded before broadcast or persistence.
  describe('incoming message limits', () => {
    const connectWriter = async (): Promise<MockWs> => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()
      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )
      return ws
    }

    const unrelatedUpdate = (): Uint8Array => {
      const client = new Y.Doc()
      try {
        client.getMap('unused').set('payload', 'unrelated data')
        return Y.encodeStateAsUpdate(client)
      } finally {
        client.destroy()
      }
    }

    describe.each([
      syncProtocol.messageYjsUpdate,
      syncProtocol.messageYjsSyncStep2,
    ])('invalid writable sync type %s', (syncType) => {
      let attacker: MockWs
      let peer: MockWs
      beforeEach(async () => {
        attacker = await connectWriter()
        peer = await connectWriter()
        peer.send.mockClear()
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MESSAGE_SYNC)
        encoding.writeVarUint(encoder, syncType)
        encoding.writeVarUint8Array(encoder, unrelatedUpdate())
        attacker._triggerMessage(encoding.toUint8Array(encoder))
      })
      it('closes the writer with a map reset', () => {
        expect(attacker.close).toHaveBeenCalledWith(
          WS_CLOSE_MAP_SYNC_RESET,
          'Map sync reset'
        )
      })
      it('closes the peer with a map reset', () => {
        expect(peer.close).toHaveBeenCalledWith(
          WS_CLOSE_MAP_SYNC_RESET,
          'Map sync reset'
        )
      })
      it('discards the rejected state', () => {
        expect(docManager.destroyDoc).toHaveBeenCalledWith('map-1')
        expect(docManager.getDoc('map-1')).toBeUndefined()
      })
      it('does not broadcast invalid data', () => {
        expect(peer.send).not.toHaveBeenCalled()
      })
      it('ignores another update queued on the rejected connection', () => {
        attacker._triggerMessage(encodeSyncUpdateMessage(unrelatedUpdate()))
        expect(docManager.destroyDoc).toHaveBeenCalledTimes(1)
      })
    })

    it('enforces cumulative map size through the gateway', async () => {
      jest
        .spyOn(configService, 'getYjsMapLimits')
        .mockReturnValue({ maxBytes: 160, maxEntries: 100, maxNodes: 10 })
      const ws = await connectWriter()
      const client = new Y.Doc()
      try {
        for (let i = 0; i < 2; i++) {
          const vector = Y.encodeStateVector(client)
          const node = new Y.Map<unknown>()
          node.set('name', 'a'.repeat(80))
          client.getMap('nodes').set(String(i), node)
          ws._triggerMessage(
            encodeSyncUpdateMessage(Y.encodeStateAsUpdate(client, vector))
          )
        }
        expect(ws.close).toHaveBeenCalledWith(
          WS_CLOSE_MAP_SYNC_RESET,
          'Map sync reset'
        )
        expect(docManager.destroyDoc).toHaveBeenCalledWith('map-1')
      } finally {
        client.destroy()
      }
    })

    describe('discarding a rejected map', () => {
      let ws: MockWs
      let peer: MockWs
      beforeEach(async () => {
        ws = await connectWriter()
        peer = await connectWriter()
        docManager.notifyClientCount.mockClear()
        ws._triggerMessage(encodeSyncUpdateMessage(unrelatedUpdate()))
      })
      it('cancels pending persistence', () => {
        expect(persistenceService.unregisterDebounce).toHaveBeenCalledWith(
          'map-1'
        )
      })
      it('releases both connection slots', () => {
        expect(limiter.releaseConnection).toHaveBeenCalledTimes(2)
      })
      it('ignores stale close callbacks', () => {
        ws._triggerClose()
        peer._triggerClose()
        expect(docManager.notifyClientCount).not.toHaveBeenCalled()
        expect(limiter.releaseConnection).toHaveBeenCalledTimes(2)
      })
      it('does not save rejected state on shutdown', () => {
        gateway.onModuleDestroy()
        expect(docManager.notifyClientCount).not.toHaveBeenCalled()
      })
    })

    describe('recovery after a map reset', () => {
      let stale: MockWs
      let currentTime: number
      beforeEach(async () => {
        currentTime = 1000
        jest.spyOn(Date, 'now').mockImplementation(() => currentTime)
        stale = await connectWriter()
        stale._triggerMessage(encodeSyncUpdateMessage(unrelatedUpdate()))
      })
      it('rejects a reconnect during the cooldown', async () => {
        const ws = await connectWriter()
        expect(ws.close).toHaveBeenCalledWith(
          WS_CLOSE_TRY_AGAIN,
          expect.any(String)
        )
      })
      describe('after fresh hydration', () => {
        let freshDoc: Y.Doc
        let fresh: MockWs
        beforeEach(async () => {
          freshDoc = new Y.Doc()
          docManager.getOrCreateDoc.mockResolvedValue(freshDoc)
          docManager.getDoc.mockReturnValue(freshDoc)
          currentTime = 11000
          fresh = await connectWriter()
          docManager.notifyClientCount.mockClear()
        })
        afterEach(() => freshDoc.destroy())
        it('accepts a reconnect after the cooldown', () => {
          expect(fresh.close).not.toHaveBeenCalled()
        })
        it('ignores stale close callbacks', () => {
          stale._triggerClose()
          expect(docManager.notifyClientCount).not.toHaveBeenCalled()
          expect(fresh.close).not.toHaveBeenCalled()
        })
        it('ignores updates from stale connections', () => {
          stale._triggerMessage(encodeSyncUpdateMessage(unrelatedUpdate()))
          expect(docManager.destroyDoc).toHaveBeenCalledTimes(1)
          expect(fresh.close).not.toHaveBeenCalled()
        })
        it('accepts fresh writes after stale callbacks', () => {
          stale._triggerClose()
          stale._triggerMessage(encodeSyncUpdateMessage(unrelatedUpdate()))
          const client = new Y.Doc()
          try {
            client.getMap('mapOptions').set('name', 'Recovered map')
            fresh._triggerMessage(
              encodeSyncUpdateMessage(Y.encodeStateAsUpdate(client))
            )
            expect(freshDoc.getMap('mapOptions').get('name')).toBe(
              'Recovered map'
            )
          } finally {
            client.destroy()
          }
        })
      })
    })

    it('terminates a peer that ignores the reset close handshake', async () => {
      jest.useFakeTimers()
      const ws = await connectWriter()
      const client = new Y.Doc()
      try {
        client.getMap('unused').set('payload', 'unrelated data')
        ws._triggerMessage(
          encodeSyncUpdateMessage(Y.encodeStateAsUpdate(client))
        )
        expect(ws.terminate).not.toHaveBeenCalled()
        jest.advanceTimersByTime(1000)
        expect(ws.terminate).toHaveBeenCalledTimes(1)
      } finally {
        client.destroy()
        jest.useRealTimers()
      }
    })

    // The writer's invalid update discards live map state and closes its peers.
    // A connection still awaiting its database lookup must then be rejected.
    it('rejects a pending connection when invalid data resets the map', async () => {
      const writer = await connectWriter()
      let resolveMap: (map: MmpMap) => void = () => {
        throw new Error('Lookup not initialized')
      }
      mapsService.findMap.mockReturnValueOnce(
        new Promise<MmpMap>((resolve) => {
          resolveMap = resolve
        })
      )
      const waiting = createMockWs()
      const setup = connectClient(
        gateway,
        waiting,
        createMockRequest('map-1', 'test-secret')
      )
      const client = new Y.Doc()
      client.getMap('unused').set('payload', 'unrelated data')
      writer._triggerMessage(
        encodeSyncUpdateMessage(Y.encodeStateAsUpdate(client))
      )
      resolveMap(createMockMap())
      await setup
      expect(waiting.close).toHaveBeenCalledWith(
        WS_CLOSE_TRY_AGAIN,
        expect.any(String)
      )
      expect(docManager.getOrCreateDoc).toHaveBeenCalledTimes(1)
      client.destroy()
    })

    it('shares the message count budget across connections and reconnects', async () => {
      jest
        .spyOn(configService, 'getYjsMessageLimits')
        .mockReturnValue({ windowMs: 10_000, maxMessages: 2, maxBytes: 10000 })
      const first = await connectWriter()
      const second = await connectWriter()
      const message = encodeSyncStep1Message(doc)
      first._triggerMessage(message)
      second._triggerMessage(message)
      first._triggerClose()
      const reconnected = await connectWriter()
      reconnected._triggerMessage(message)
      expect(reconnected.close).toHaveBeenCalledWith(
        1008,
        'Map message rate limit exceeded'
      )
    })

    it('bounds bytes as well as count before decoding', async () => {
      const message = encodeSyncStep1Message(doc)
      jest.spyOn(configService, 'getYjsMessageLimits').mockReturnValue({
        windowMs: 10_000,
        maxMessages: 100,
        maxBytes: message.byteLength,
      })
      const ws = await connectWriter()
      ws._triggerMessage(message)
      expect(ws.close).not.toHaveBeenCalled()
      ws._triggerMessage(message)
      expect(ws.close).toHaveBeenCalledWith(
        1008,
        'Map message rate limit exceeded'
      )
    })

    it('allows messages again when the rate window expires', async () => {
      jest
        .spyOn(configService, 'getYjsMessageLimits')
        .mockReturnValue({ windowMs: 10_000, maxMessages: 1, maxBytes: 10000 })
      let currentTime = 1000
      jest.spyOn(Date, 'now').mockImplementation(() => currentTime)
      const ws = await connectWriter()
      const message = encodeSyncStep1Message(doc)
      ws._triggerMessage(message)
      currentTime = 11000
      ws._triggerMessage(message)
      expect(ws.close).not.toHaveBeenCalled()
    })
  })

  // ─── Disconnect handling ───────────────────────────────────

  describe('disconnect handling', () => {
    it('decrements client count on disconnect', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws1 = createMockWs()
      const ws2 = createMockWs()

      await connectClient(
        gateway,
        ws1,
        createMockRequest('map-1', 'test-secret')
      )
      await connectClient(
        gateway,
        ws2,
        createMockRequest('map-1', 'test-secret')
      )
      docManager.notifyClientCount.mockClear()
      ws1._triggerClose()
      await new Promise((r) => setTimeout(r, 0))

      expect(docManager.notifyClientCount).toHaveBeenCalledWith('map-1', 1)
    })

    it('releases limiter slot on disconnect', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      limiter.getClientIp.mockReturnValue('10.0.0.1')
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret', '10.0.0.1')
      )
      ws._triggerClose()

      expect(limiter.releaseConnection).toHaveBeenCalledWith('10.0.0.1')
    })

    describe('a client leaving while setup awaits the database', () => {
      let ws: MockWs
      beforeEach(async () => {
        ws = createMockWs()
        limiter.getClientIp.mockReturnValue('10.0.0.2')
        mapsService.findMap.mockImplementation(async () => {
          ws.readyState = WebSocket.CLOSED
          return createMockMap()
        })
        await connectClient(
          gateway,
          ws,
          createMockRequest('map-1', 'test-secret', '10.0.0.2')
        )
      })
      it('releases the connection slot', () => {
        expect(limiter.releaseConnection).toHaveBeenCalledWith('10.0.0.2')
      })
      it('restores the client count', () => {
        expect(docManager.notifyClientCount).toHaveBeenLastCalledWith(
          'map-1',
          0
        )
      })
      it('does not send initial sync data', () => {
        expect(ws.send).not.toHaveBeenCalled()
      })
    })

    it('survives notifyClientCount errors without crashing', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )
      docManager.notifyClientCount.mockRejectedValue(
        new Error('DB connection lost')
      )

      expect(() => ws._triggerClose()).not.toThrow()
      await new Promise((r) => setTimeout(r, 0))
    })

    it('terminates connection on WebSocket error', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )
      ws._triggerError(new Error('ECONNRESET'))

      expect(ws.terminate).toHaveBeenCalled()
    })
  })

  // ─── closeConnectionsForMap (public API) ───────────────────

  describe('closeConnectionsForMap', () => {
    it('closes all connections for the specified map', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws1 = createMockWs()
      const ws2 = createMockWs()

      await connectClient(
        gateway,
        ws1,
        createMockRequest('map-1', 'test-secret')
      )
      await connectClient(
        gateway,
        ws2,
        createMockRequest('map-1', 'test-secret')
      )

      gateway.closeConnectionsForMap('map-1')

      expect(ws1.close).toHaveBeenCalledWith(
        WS_CLOSE_MAP_DELETED,
        'Map deleted'
      )
      expect(ws2.close).toHaveBeenCalledWith(
        WS_CLOSE_MAP_DELETED,
        'Map deleted'
      )
    })

    it('does not affect connections to other maps', async () => {
      const map1 = createMockMap()
      const map2 = createMockMap()
      map2.id = 'map-2'
      const doc2 = new Y.Doc()

      mapsService.findMap.mockImplementation(async (id: string) =>
        id === 'map-1' ? map1 : map2
      )
      docManager.getOrCreateDoc.mockImplementation(async (id: string) =>
        id === 'map-1' ? doc : doc2
      )

      const ws1 = createMockWs()
      const ws2 = createMockWs()

      await connectClient(
        gateway,
        ws1,
        createMockRequest('map-1', 'test-secret')
      )
      await connectClient(
        gateway,
        ws2,
        createMockRequest('map-2', 'test-secret')
      )

      gateway.closeConnectionsForMap('map-1')

      expect(ws1.close).toHaveBeenCalled()
      expect(ws2.close).not.toHaveBeenCalled()

      doc2.destroy()
    })
  })

  // ─── Handshake ─────────────────────────────────────────────

  describe('handshake', () => {
    let server: Server
    let realGateway: YjsGateway

    beforeEach(async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      server = createServer()
      const host = { httpAdapter: { getHttpServer: () => server } }
      realGateway = new YjsGateway(
        host as unknown as HttpAdapterHost,
        docManager,
        {
          registerDebounce: jest.fn(),
          unregisterDebounce: jest.fn(),
        } as unknown as YjsPersistenceService,
        mapsService,
        limiter
      )
      realGateway.onModuleInit()
      await new Promise<void>((resolve) => server.listen(0, resolve))
    })

    afterEach(async () => {
      realGateway.onModuleDestroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    })

    // Opens a socket offering the given subprotocols and resolves with the
    // subprotocol the server selected
    const selectedProtocol = (protocols: string[]): Promise<string> => {
      const { port } = server.address() as AddressInfo
      const client = new WebSocket(
        `ws://127.0.0.1:${port}/yjs/map-1`,
        protocols
      )
      return new Promise((resolve, reject) => {
        client.on('open', () => {
          resolve(client.protocol)
          client.close()
        })
        client.on('error', reject)
      })
    }

    // Opens a socket offering the given subprotocols and resolves with the
    // HTTP status and `Upgrade` header of the refused upgrade
    const refusal = (
      protocols: string[]
    ): Promise<{ status?: number; upgrade?: string }> => {
      const { port } = server.address() as AddressInfo
      const client = new WebSocket(
        `ws://127.0.0.1:${port}/yjs/map-1`,
        protocols
      )
      return new Promise((resolve, reject) => {
        client.on('unexpected-response', (_req, res) => {
          resolve({ status: res.statusCode, upgrade: res.headers.upgrade })
          client.terminate()
        })
        client.on('open', () => {
          client.terminate()
          reject(new Error('The server accepted the upgrade'))
        })
        client.on('error', reject)
      })
    }

    it('selects the Yjs subprotocol and leaves the secret out of the response', async () => {
      const protocol = await selectedProtocol([
        YJS_SUBPROTOCOL,
        'teammapper.secret.test-secret',
      ])

      expect(protocol).toBe(YJS_SUBPROTOCOL)
    })

    it('refuses a client that offers no subprotocol or an older version', async () => {
      const upgradeRequired = { status: 426, upgrade: 'websocket' }
      expect([await refusal([]), await refusal(['teammapper.v1'])]).toEqual([
        upgradeRequired,
        upgradeRequired,
      ])
    })
  })
})
