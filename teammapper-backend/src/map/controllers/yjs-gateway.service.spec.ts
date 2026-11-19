import { YjsGateway } from './yjs-gateway.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsPersistenceService } from '../services/yjs-persistence.service'
import { MapsService } from '../services/maps.service'
import { WsConnectionLimiterService } from '../services/ws-connection-limiter.service'
import configService from '../../config.service'
import { Logger } from '@nestjs/common'
import { applyValidatedMapUpdate } from '../utils/yjsValidation'
import { DEFAULT_YJS_MAP_LIMITS, maxMessagePayload } from '../utils/yjsLimits'
import {
  MapUpdateRejectionReason,
  WS_CLOSE_MAP_SYNC_RESET,
  WS_CLOSE_MAP_UPDATE_REJECTED,
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
  encodeAwarenessMessage,
  toUint8Array,
} from '../utils/yjsProtocol'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
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

  const createGateway = (): YjsGateway => {
    const httpAdapterHost: Pick<HttpAdapterHost, 'httpAdapter'> = {
      httpAdapter: {
        getHttpServer: jest.fn().mockReturnValue({ on: jest.fn() }),
      } as unknown as HttpAdapterHost['httpAdapter'],
    }
    return new YjsGateway(
      httpAdapterHost as HttpAdapterHost,
      docManager,
      persistenceService,
      mapsService,
      limiter
    )
  }

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

    gateway = createGateway()
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

    const syncMessageWith = (
      syncType: number,
      update: Uint8Array,
      trailing = false
    ): Uint8Array => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      encoding.writeVarUint(encoder, syncType)
      encoding.writeVarUint8Array(encoder, update)
      if (trailing) encoding.writeVarUint(encoder, 7)
      return encoding.toUint8Array(encoder)
    }

    const expectRejected = (
      ws: MockWs,
      reason: MapUpdateRejectionReason
    ): void => {
      expect(ws.close).toHaveBeenCalledWith(
        WS_CLOSE_MAP_UPDATE_REJECTED,
        reason
      )
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
        attacker._triggerMessage(syncMessageWith(syncType, unrelatedUpdate()))
      })
      it('closes the writer as the sender of a rejected change', () => {
        expectRejected(attacker, 'unknownRoot')
      })
      it('closes the peer with a map reset that names the reason', () => {
        expect(peer.close).toHaveBeenCalledWith(
          WS_CLOSE_MAP_SYNC_RESET,
          'unknownRoot'
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
      jest.spyOn(configService, 'getYjsMapLimits').mockReturnValue({
        maxBytes: 160,
        maxEntries: 100,
        maxNodes: 10,
        maxArrows: 10,
      })
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
        expectRejected(ws, 'mapTooLarge')
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
      expect(ws.close).toHaveBeenCalledWith(1008, 'rateLimited')
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

    describe('map budget', () => {
      const presenceMessage = (selectedNodeId: string): Uint8Array => {
        const client = new Y.Doc()
        const awareness = new awarenessProtocol.Awareness(client)
        try {
          awareness.setLocalStateField('user', { selectedNodeId })
          return encodeAwarenessMessage(awareness, [client.clientID])
        } finally {
          awareness.destroy()
          client.destroy()
        }
      }

      beforeEach(() => {
        jest.spyOn(configService, 'getYjsMessageLimits').mockReturnValue({
          windowMs: 10_000,
          maxMessages: 3,
          maxBytes: 10000,
        })
      })

      it('does not charge presence messages to the map', async () => {
        const selecting = await connectWriter()
        const editing = await connectWriter()
        for (const nodeId of ['a', 'b', 'c'])
          selecting._triggerMessage(presenceMessage(nodeId))
        for (let i = 0; i < 3; i++)
          editing._triggerMessage(encodeSyncStep1Message(doc))
        expect(selecting.close).not.toHaveBeenCalled()
        expect(editing.close).not.toHaveBeenCalled()
      })

      it('bounds presence messages per connection', async () => {
        const selecting = await connectWriter()
        for (const nodeId of ['a', 'b', 'c', 'd'])
          selecting._triggerMessage(presenceMessage(nodeId))
        expect(selecting.close).toHaveBeenCalledWith(1008, 'rateLimited')
      })

      describe('when one connection exceeds it', () => {
        let heavy: MockWs
        let light: MockWs
        beforeEach(async () => {
          heavy = await connectWriter()
          const other = await connectWriter()
          light = await connectWriter()
          for (const ws of [heavy, heavy, other])
            ws._triggerMessage(encodeSyncStep1Message(doc))
          light._triggerMessage(encodeSyncStep1Message(doc))
        })
        it('keeps a lighter peer connected when it crosses the limit', () => {
          expect(light.close).not.toHaveBeenCalled()
        })
        it('closes the heaviest sender on its next message', () => {
          heavy._triggerMessage(encodeSyncStep1Message(doc))
          expect(heavy.close).toHaveBeenCalledWith(1008, 'rateLimited')
        })
      })

      // A peer that reconnects starts a fresh share, so only the ceiling
      // bounds a peer that keeps opening new connections.
      it('closes any sender past twice the limit', async () => {
        jest.spyOn(configService, 'getYjsMessageLimits').mockReturnValue({
          windowMs: 10_000,
          maxMessages: 4,
          maxBytes: 10000,
        })
        const light = await connectWriter()
        light._triggerMessage(encodeSyncStep1Message(doc))
        const heavy = await connectWriter()
        for (let i = 0; i < 4; i++)
          heavy._triggerMessage(encodeSyncStep1Message(doc))
        for (let i = 0; i < 3; i++)
          (await connectWriter())._triggerMessage(encodeSyncStep1Message(doc))
        light._triggerMessage(encodeSyncStep1Message(doc))
        expect(light.close).toHaveBeenCalledWith(1008, 'rateLimited')
      })
    })

    describe('rejection reasons and log lines', () => {
      let warn: ReturnType<typeof jest.spyOn>
      let error: ReturnType<typeof jest.spyOn>

      const lines = (spy: {
        mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> }
      }): string[] => spy.mock.calls.map((call) => String(call[0]))

      const rejectionLines = (): string[] =>
        lines(warn).filter((line) => line.includes('Rejected map update'))

      // A fake clock needs a gateway built after it starts, because the
      // gateway reads the clock when it is constructed.
      const rebuildGateway = (): void => {
        gateway.onModuleDestroy()
        gateway = createGateway()
      }

      const emptyUpdate = (): Uint8Array => {
        const client = new Y.Doc()
        try {
          return Y.encodeStateAsUpdate(client)
        } finally {
          client.destroy()
        }
      }

      // A message that carries a node with a long name, bigger than `bytes`
      const oversizedMessage = (): Uint8Array => {
        const client = new Y.Doc()
        try {
          const node = new Y.Map<unknown>()
          node.set('name', 'a'.repeat(500))
          client.getMap('nodes').set('big', node)
          return encodeSyncUpdateMessage(Y.encodeStateAsUpdate(client))
        } finally {
          client.destroy()
        }
      }

      const limitMapBytes = (maxBytes: number): void => {
        jest
          .spyOn(configService, 'getYjsMapLimits')
          .mockReturnValue({ ...DEFAULT_YJS_MAP_LIMITS, maxBytes })
      }

      beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
        error = jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => {})
      })

      describe('when validation rejects a change', () => {
        let message: Uint8Array
        beforeEach(async () => {
          const attacker = await connectWriter()
          await connectWriter()
          message = encodeSyncUpdateMessage(unrelatedUpdate())
          attacker._triggerMessage(message)
        })

        it('logs one WARN line with reason, size, client count and action', () => {
          expect(rejectionLines()).toEqual([
            `Rejected map update on map map-1: reason=unknownRoot bytes=${message.byteLength} clients=2 action=reset`,
          ])
        })

        it('logs no separate line for the discarded state', () => {
          expect(lines(warn).some((line) => line.includes('Discarded'))).toBe(
            false
          )
        })
      })

      it.each([
        [
          'trailing sync data',
          'closed',
          () =>
            syncMessageWith(syncProtocol.messageYjsUpdate, emptyUpdate(), true),
        ],
        [
          'an unknown sync type',
          'closed',
          () => syncMessageWith(9, emptyUpdate()),
        ],
        [
          'undecodable update bytes',
          'reset',
          () =>
            syncMessageWith(
              syncProtocol.messageYjsUpdate,
              new TextEncoder().encode('not an update')
            ),
        ],
      ])(
        'closes the sender of %s as malformedUpdate, action=%s',
        async (_name, action, message) => {
          const ws = await connectWriter()
          ws._triggerMessage(message())
          expectRejected(ws, 'malformedUpdate')
          expect(rejectionLines()[0]).toContain(`action=${action}`)
        }
      )

      it('logs a budget overrun as a retry', async () => {
        const message = encodeSyncStep1Message(doc)
        jest.spyOn(configService, 'getYjsMessageLimits').mockReturnValue({
          windowMs: 10_000,
          maxMessages: 1,
          maxBytes: 10_000,
        })
        const ws = await connectWriter()
        ws._triggerMessage(message)
        ws._triggerMessage(message)
        expect(rejectionLines()).toEqual([
          expect.stringContaining('reason=rateLimited'),
        ])
        expect(rejectionLines()[0]).toContain('action=retry')
      })

      describe('a message above the map size limit', () => {
        let sender: MockWs
        let peer: MockWs
        beforeEach(async () => {
          limitMapBytes(300)
          sender = await connectWriter()
          peer = await connectWriter()
          sender._triggerMessage(oversizedMessage())
        })

        it('closes the sender with mapTooLarge', () => {
          expectRejected(sender, 'mapTooLarge')
        })

        it('leaves the peer connected', () => {
          expect(peer.close).not.toHaveBeenCalled()
        })

        it('resets no map', () => {
          expect(docManager.destroyDoc).not.toHaveBeenCalled()
        })

        it('logs one WARN line that closes the sender alone', () => {
          expect(rejectionLines()).toEqual([
            expect.stringMatching(
              /reason=mapTooLarge bytes=\d+ clients=2 action=closed$/
            ),
          ])
        })
      })

      it('names the message size, not the budget, when a large message exceeds the budget', async () => {
        limitMapBytes(300)
        jest.spyOn(configService, 'getYjsMessageLimits').mockReturnValue({
          windowMs: 10_000,
          maxMessages: 100,
          maxBytes: 300,
        })
        const ws = await connectWriter()
        ws._triggerMessage(oversizedMessage())
        expectRejected(ws, 'mapTooLarge')
      })

      describe('throttling', () => {
        beforeEach(() => {
          jest.useFakeTimers()
          rebuildGateway()
          limitMapBytes(300)
        })
        afterEach(() => jest.useRealTimers())

        const rejectOversized = async (): Promise<void> => {
          const ws = await connectWriter()
          ws._triggerMessage(oversizedMessage())
        }

        it('logs one line for 50 rejections of one map and reason within a minute', async () => {
          for (let i = 0; i < 50; i++) await rejectOversized()
          expect(rejectionLines()).toHaveLength(1)
        })

        it('logs the suppressed count on the first line after the window', async () => {
          for (let i = 0; i < 50; i++) await rejectOversized()
          jest.advanceTimersByTime(61_000)
          await rejectOversized()
          expect(rejectionLines()).toHaveLength(2)
          expect(rejectionLines()[1]).toContain('suppressed=49')
        })

        it('logs another reason for the same map on its own line', async () => {
          await rejectOversized()
          const ws = await connectWriter()
          ws._triggerMessage(
            syncMessageWith(syncProtocol.messageYjsUpdate, emptyUpdate(), true)
          )
          expect(rejectionLines()).toHaveLength(2)
        })

        it('drops an ended window at the heartbeat', async () => {
          await rejectOversized()
          await rejectOversized()
          jest.advanceTimersByTime(61_000)
          ;(gateway as unknown as { runHeartbeat(): void }).runHeartbeat()
          await rejectOversized()
          expect(rejectionLines()[1]).not.toContain('suppressed')
        })
      })

      describe('a socket error', () => {
        const overflow = (): Error =>
          Object.assign(new Error('Max payload size exceeded'), {
            code: 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH',
          })

        it('logs a payload overflow as mapTooLarge at WARN, not ERROR', async () => {
          jest
            .spyOn(configService, 'getYjsMapLimits')
            .mockReturnValue(DEFAULT_YJS_MAP_LIMITS)
          const ws = await connectWriter()
          ws._triggerError(overflow())
          expect(rejectionLines()).toEqual([
            `Rejected map update on map map-1: reason=mapTooLarge bytes=>${5 * 1024 * 1024 + 64 * 1024} clients=1 action=closed`,
          ])
          expect(error).not.toHaveBeenCalled()
        })

        it('terminates a payload overflow after 1 s, not at once', async () => {
          jest.useFakeTimers()
          try {
            const ws = await connectWriter()
            ws._triggerError(overflow())
            expect(ws.terminate).not.toHaveBeenCalled()
            jest.advanceTimersByTime(1000)
            expect(ws.terminate).toHaveBeenCalledTimes(1)
          } finally {
            jest.useRealTimers()
          }
        })

        it('logs any other error at ERROR and terminates at once', async () => {
          const ws = await connectWriter()
          ws._triggerError(new Error('ECONNRESET'))
          expect(error).toHaveBeenCalledWith(
            expect.stringContaining('ECONNRESET')
          )
          expect(ws.terminate).toHaveBeenCalledTimes(1)
          expect(rejectionLines()).toHaveLength(0)
        })
      })

      it('closes a client that connects to a map awaiting its reset as mapRejected', async () => {
        const rejected = new Y.Doc()
        try {
          expect(() =>
            applyValidatedMapUpdate(rejected, unrelatedUpdate(), null)
          ).toThrow()
          docManager.getOrCreateDoc.mockResolvedValue(rejected)
          const ws = await connectWriter()
          expect(ws.close).toHaveBeenCalledWith(
            WS_CLOSE_MAP_SYNC_RESET,
            'mapRejected'
          )
        } finally {
          rejected.destroy()
        }
      })
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
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
      jest
        .spyOn(configService, 'getYjsMapLimits')
        .mockReturnValue(DEFAULT_YJS_MAP_LIMITS)
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

    // Opens a writable client that keeps a replica of the map. `synced`
    // resolves once the server sent its first message, which means the server
    // reads this client's messages from then on.
    const openClient = () => {
      const { port } = server.address() as AddressInfo
      const client = new WebSocket(`ws://127.0.0.1:${port}/yjs/map-1`, [
        YJS_SUBPROTOCOL,
        `${YJS_SECRET_SUBPROTOCOL_PREFIX}test-secret`,
      ])
      const replica = new Y.Doc()
      const synced = new Promise<void>((resolve, reject) => {
        client.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
          const decoder = decoding.createDecoder(toUint8Array(data))
          if (decoding.readVarUint(decoder) === MESSAGE_SYNC)
            syncProtocol.readSyncMessage(
              decoder,
              encoding.createEncoder(),
              replica,
              null
            )
          resolve()
        })
        client.on('error', reject)
      })
      const closed = new Promise<number>((resolve) =>
        client.on('close', (code) => resolve(code))
      )
      return { client, replica, synced, closed }
    }

    // Resolves once the replica holds `count` nodes, and fails if the server
    // closes the socket first
    const nodesArrive = (
      replica: Y.Doc,
      count: number,
      closed: Promise<number>
    ): Promise<void> => {
      const arrived = new Promise<void>((resolve) => {
        const check = (): void => {
          if (replica.getMap('nodes').size >= count) resolve()
        }
        replica.on('update', check)
        check()
      })
      const closedFirst = closed.then((code) => {
        throw new Error(`The server closed the socket with code ${code}`)
      })
      return Promise.race([arrived, closedFirst])
    }

    it('delivers a valid 2 MiB map change to a second client', async () => {
      const sender = openClient()
      const receiver = openClient()
      await Promise.all([sender.synced, receiver.synced])
      const nodeCount = 4100
      sender.replica.transact(() => {
        for (let i = 0; i < nodeCount; i++) {
          const node = new Y.Map<unknown>()
          node.set('name', 'a'.repeat(512))
          sender.replica.getMap('nodes').set(`node-${i}`, node)
        }
      })
      const update = Y.encodeStateAsUpdate(sender.replica)
      expect(update.byteLength).toBeGreaterThan(2 * 1024 * 1024)

      sender.client.send(encodeSyncUpdateMessage(update))

      await expect(
        nodesArrive(
          receiver.replica,
          nodeCount,
          Promise.race([sender.closed, receiver.closed])
        )
      ).resolves.toBeUndefined()
      sender.client.close()
      receiver.client.close()
    }, 20_000)

    it('closes a sender with 1009 when its message exceeds the payload limit', async () => {
      const sender = openClient()
      await sender.synced

      sender.client.send(
        'a'.repeat(maxMessagePayload(DEFAULT_YJS_MAP_LIMITS) + 1)
      )

      await expect(sender.closed).resolves.toBe(1009)
    }, 20_000)

    it('sets the payload limit from the configured map size limit', () => {
      realGateway.onModuleDestroy()
      jest
        .spyOn(configService, 'getYjsMapLimits')
        .mockReturnValue({ ...DEFAULT_YJS_MAP_LIMITS, maxBytes: 65536 })
      realGateway.onModuleInit()

      const { wss } = realGateway as unknown as {
        wss: { options: { maxPayload: number } }
      }
      expect(wss.options.maxPayload).toBe(131072)
    })
  })
})
