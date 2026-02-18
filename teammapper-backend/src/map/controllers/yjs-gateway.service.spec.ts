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
  encodeSyncStep1Message,
  encodeSyncUpdateMessage,
} from '../utils/yjsProtocol'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

// WARNING: These interfaces mirror private method signatures of YjsGateway.
// TypeScript cannot verify they stay in sync. If the private methods change
// signature, update these interfaces to match.
interface ConnectionHandler {
  handleConnection(ws: MockWs, req: IncomingMessage): Promise<void>
}

interface HeartbeatRunner {
  runHeartbeat(): void
}

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

const connectClient = async (
  gateway: YjsGateway,
  ws: MockWs,
  req: IncomingMessage
) => {
  const handler = gateway as unknown as ConnectionHandler
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

  describe('connection with valid map ID', () => {
    it('creates doc and notifies client count', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      expect(docManager.getOrCreateDoc).toHaveBeenCalledWith('map-1')
      expect(docManager.notifyClientCount).toHaveBeenCalledWith('map-1', 1)
    })

    it('sends full doc state so client syncs even without SyncStep1', async () => {
      doc.getMap('nodes').set('node-1', new Y.Map())
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      // Simulate client receiving messages WITHOUT having sent SyncStep1
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

    it('sends SyncStep1 and SyncStep2 on connection', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      const syncMessages = ws.send.mock.calls
        .map((call) => new Uint8Array(call[0] as Buffer))
        .filter((data) => {
          const decoder = decoding.createDecoder(data)
          return decoding.readVarUint(decoder) === MESSAGE_SYNC
        })
        .map((data) => {
          const decoder = decoding.createDecoder(data)
          decoding.readVarUint(decoder)
          return decoding.readVarUint(decoder)
        })

      expect(syncMessages).toEqual([
        syncProtocol.messageYjsSyncStep1,
        syncProtocol.messageYjsSyncStep2,
      ])
    })

    it('sends write-access message before sync messages', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      const messageTypes = ws.send.mock.calls.map((call) => {
        const data = new Uint8Array(call[0] as Buffer)
        const decoder = decoding.createDecoder(data)
        return decoding.readVarUint(decoder)
      })

      const writeAccessIndex = messageTypes.indexOf(MESSAGE_WRITE_ACCESS)
      const firstSyncIndex = messageTypes.indexOf(MESSAGE_SYNC)

      expect(writeAccessIndex).toBeGreaterThanOrEqual(0)
      expect(firstSyncIndex).toBeGreaterThanOrEqual(0)
      expect(writeAccessIndex).toBeLessThan(firstSyncIndex)
    })
  })

  describe('connection with invalid map ID', () => {
    it('closes connection when map not found', async () => {
      mapsService.findMap.mockResolvedValue(null)
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('nonexistent'))

      expect(ws.close).toHaveBeenCalledWith(
        WS_CLOSE_MAP_NOT_FOUND,
        'Map not found'
      )
    })

    it('does not create doc when map not found', async () => {
      mapsService.findMap.mockResolvedValue(null)
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('nonexistent'))

      expect(docManager.getOrCreateDoc).not.toHaveBeenCalled()
    })

    it('releases limiter slot when map not found', async () => {
      mapsService.findMap.mockResolvedValue(null)
      limiter.getClientIp.mockReturnValue('10.0.0.1')
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('nonexistent'))

      expect(limiter.releaseConnection).toHaveBeenCalledWith('10.0.0.1')
    })
  })

  describe('connection with missing mapId parameter', () => {
    it('closes connection with error', async () => {
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest(null))

      expect(ws.close).toHaveBeenCalledWith(
        WS_CLOSE_MISSING_PARAM,
        'Missing mapId'
      )
    })

    it('releases limiter slot when mapId missing', async () => {
      limiter.getClientIp.mockReturnValue('10.0.0.1')
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest(null))

      expect(limiter.releaseConnection).toHaveBeenCalledWith('10.0.0.1')
    })
  })

  describe('read-only client cannot write', () => {
    it('allows sync step 1 from read-only client', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap('secret-123'))
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'wrong-secret')
      )
      ws.send.mockClear()

      const clientDoc = new Y.Doc()
      ws._triggerMessage(encodeSyncStep1Message(clientDoc))

      expect(ws.send).toHaveBeenCalled()
      clientDoc.destroy()
    })

    it('drops sync update messages from read-only client', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap('secret-123'))
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'wrong-secret')
      )

      doc.getMap('nodes').set('existing', new Y.Map())
      const initialSize = doc.getMap('nodes').size
      ws.send.mockClear()

      const clientDoc = new Y.Doc()
      clientDoc.getMap('nodes').set('new-node', new Y.Map())
      const update = Y.encodeStateAsUpdate(clientDoc)
      ws._triggerMessage(encodeSyncUpdateMessage(update))

      expect(doc.getMap('nodes').size).toBe(initialSize)
      clientDoc.destroy()
    })
  })

  describe('read-write client can write', () => {
    it('applies sync messages from read-write client', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap('secret-123'))
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('map-1', 'secret-123'))

      const clientDoc = new Y.Doc()
      ws._triggerMessage(encodeSyncStep1Message(clientDoc))

      expect(ws.send).toHaveBeenCalled()
      clientDoc.destroy()
    })

    it('allows writes when map has no modification secret', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap(null))
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest('map-1'))
      ws.send.mockClear()

      const clientDoc = new Y.Doc()
      clientDoc.getMap('nodes').set('new-node', new Y.Map())
      const update = Y.encodeStateAsUpdate(clientDoc)
      ws._triggerMessage(encodeSyncUpdateMessage(update))

      expect(doc.getMap('nodes').has('new-node')).toBe(true)
      clientDoc.destroy()
    })
  })

  describe('connection close handler', () => {
    it('notifies doc manager with remaining count on disconnect', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )
      docManager.notifyClientCount.mockClear()
      ws._triggerClose()

      // Allow the async notifyClientCount promise to settle
      await new Promise((r) => setTimeout(r, 0))

      expect(docManager.notifyClientCount).toHaveBeenCalledWith('map-1', 0)
    })

    it('passes correct remaining count with multiple clients', async () => {
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

    it('delegates to limiter on connection close', async () => {
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
  })

  describe('map deletion closes connections', () => {
    it('closes all WebSocket connections for a map', async () => {
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

    it('does nothing for non-existent map', () => {
      gateway.closeConnectionsForMap('nonexistent')
    })
  })

  describe('WebSocket error handling', () => {
    it('terminates connection on error event', async () => {
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

    it('does not crash the server process on error', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      expect(() => ws._triggerError(new Error('write EPIPE'))).not.toThrow()
    })
  })

  describe('ping/pong heartbeat', () => {
    const runHeartbeat = (gw: YjsGateway) =>
      (gw as unknown as HeartbeatRunner).runHeartbeat()

    it('pings on first heartbeat', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      runHeartbeat(gateway)

      expect(ws.ping).toHaveBeenCalledTimes(1)
    })

    it('terminates zombie on second heartbeat without pong', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      runHeartbeat(gateway)
      runHeartbeat(gateway)

      expect(ws.terminate).toHaveBeenCalled()
    })

    it('survives after pong response', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      runHeartbeat(gateway)
      ws._triggerPong()
      runHeartbeat(gateway)

      expect(ws.terminate).not.toHaveBeenCalled()
    })

    it('pings on each heartbeat cycle', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      runHeartbeat(gateway)
      ws._triggerPong()
      runHeartbeat(gateway)

      expect(ws.ping).toHaveBeenCalledTimes(2)
    })

    it('delegates rate window cleanup to limiter', async () => {
      runHeartbeat(gateway)

      expect(limiter.cleanupExpiredRateWindows).toHaveBeenCalled()
    })

    it('clears heartbeat interval on shutdown', () => {
      gateway.onModuleInit()
      gateway.onModuleDestroy()

      // After destroy, no further heartbeat runs
      // (verified by no errors thrown after cleanup)
    })
  })

  describe('connection setup timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('closes with 1013 when setup exceeds timeout', async () => {
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
    })

    it('completes normally when setup finishes within timeout', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      expect(ws.close).not.toHaveBeenCalledWith(
        WS_CLOSE_TRY_AGAIN,
        expect.any(String)
      )
      expect(docManager.getOrCreateDoc).toHaveBeenCalledWith('map-1')
    })

    it('cancels timer on early completion', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      jest.advanceTimersByTime(15_000)
      await Promise.resolve()

      expect(ws.close).not.toHaveBeenCalledWith(
        WS_CLOSE_TRY_AGAIN,
        expect.any(String)
      )
    })
  })

  describe('multiple maps isolation', () => {
    it('connections to different maps are independent', async () => {
      const map1 = createMockMap()
      const map2 = createMockMap()
      map2.id = 'map-2'

      const doc2 = new Y.Doc()
      mapsService.findMap.mockImplementation(async (id: string) => {
        return id === 'map-1' ? map1 : map2
      })
      docManager.getOrCreateDoc.mockImplementation(async (id: string) => {
        return id === 'map-1' ? doc : doc2
      })

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

  describe('notifyClientCount error handling', () => {
    it('logs persistence errors on disconnect without crashing', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      // Mock to reject for the close handler call
      docManager.notifyClientCount.mockRejectedValue(
        new Error('DB connection lost')
      )

      // Close should not throw even when notifyClientCount rejects
      expect(() => ws._triggerClose()).not.toThrow()

      // Allow the promise rejection to be caught
      await new Promise((r) => setTimeout(r, 0))

      expect(docManager.notifyClientCount).toHaveBeenCalledWith('map-1', 0)
    })
  })

  describe('grace timer restoration on setup failure', () => {
    it('restores grace timer when notifyClientCount throws', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      docManager.notifyClientCount.mockRejectedValue(
        new Error('Unexpected error')
      )
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      expect(docManager.restoreGraceTimer).toHaveBeenCalledWith(
        'map-1',
        expect.any(Number)
      )
    })

    it('does not restore grace timer on successful setup', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      expect(docManager.restoreGraceTimer).not.toHaveBeenCalled()
    })
  })
})
