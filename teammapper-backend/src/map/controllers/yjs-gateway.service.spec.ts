import { YjsGateway } from './yjs-gateway.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsPersistenceService } from '../services/yjs-persistence.service'
import { MapsService } from '../services/maps.service'
import { WsConnectionLimiterService } from '../services/ws-connection-limiter.service'
import { MmpMap } from '../entities/mmpMap.entity'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import { jest } from '@jest/globals'
import type { IncomingMessage } from 'http'
import type { HttpAdapterHost } from '@nestjs/core'
import {
  WS_CLOSE_MISSING_PARAM,
  WS_CLOSE_MAP_DELETED,
  WS_CLOSE_MAP_NOT_FOUND,
  WS_CLOSE_TRY_AGAIN,
  CONNECTION_SETUP_TIMEOUT_MS,
  MESSAGE_SYNC,
  MESSAGE_WRITE_ACCESS,
  encodeSyncUpdateMessage,
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
  on: jest.Mock
  close: jest.Mock
  send: jest.Mock
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
    send: jest.fn((_data: Uint8Array | Buffer, cb?: (err?: Error) => void) => {
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

const createMockRequest = (
  mapId: string | null,
  secret: string | null = null,
  ip: string = '127.0.0.1'
): IncomingMessage => {
  const params = new URLSearchParams()
  if (mapId) params.set('mapId', mapId)
  if (secret) params.set('secret', secret)
  return {
    url: `/yjs?${params.toString()}`,
    socket: { remoteAddress: ip },
    headers: {},
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
      destroyDoc: jest.fn(),
      hasDoc: jest.fn<YjsDocManagerService['hasDoc']>().mockReturnValue(true),
      restoreGraceTimer: jest.fn(),
    } as unknown as jest.Mocked<YjsDocManagerService>

    const persistenceService = {
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

    it('sends write-access before sync messages', async () => {
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
      const writeIdx = messageTypes.indexOf(MESSAGE_WRITE_ACCESS)
      const syncIdx = messageTypes.indexOf(MESSAGE_SYNC)

      expect(writeIdx).toBeGreaterThanOrEqual(0)
      expect(writeIdx).toBeLessThan(syncIdx)
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
})
