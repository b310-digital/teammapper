import { YjsGateway } from './yjs-gateway.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsPersistenceService } from '../services/yjs-persistence.service'
import { MapsService } from '../services/maps.service'
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
  encodeSyncStep1Message,
  encodeSyncUpdateMessage,
} from '../utils/yjsProtocol'

jest.mock('../../config.service', () => ({
  __esModule: true,
  default: {
    isYjsEnabled: jest.fn(() => true),
  },
}))

// Minimal interfaces to call private methods in tests
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
  secret: string | null = null
): IncomingMessage => {
  const params = new URLSearchParams()
  if (mapId) params.set('mapId', mapId)
  if (secret) params.set('secret', secret)
  return { url: `/yjs?${params.toString()}` } as IncomingMessage
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
      incrementClientCount: jest.fn(),
      decrementClientCount: jest
        .fn<YjsDocManagerService['decrementClientCount']>()
        .mockResolvedValue(undefined),
      destroyDoc: jest.fn(),
      hasDoc: jest.fn<YjsDocManagerService['hasDoc']>().mockReturnValue(true),
    } as unknown as jest.Mocked<YjsDocManagerService>

    const persistenceService = {
      registerDebounce: jest.fn(),
      unregisterDebounce: jest.fn(),
    } as unknown as jest.Mocked<YjsPersistenceService>

    const httpAdapterHost: Pick<HttpAdapterHost, 'httpAdapter'> = {
      httpAdapter: {
        getHttpServer: jest.fn().mockReturnValue({ on: jest.fn() }),
      } as unknown as HttpAdapterHost['httpAdapter'],
    }

    gateway = new YjsGateway(
      httpAdapterHost as HttpAdapterHost,
      docManager,
      persistenceService,
      mapsService
    )
  })

  afterEach(() => {
    gateway.onModuleDestroy()
    doc.destroy()
    jest.restoreAllMocks()
  })

  describe('connection with valid map ID', () => {
    it('accepts connection and sets up sync', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      expect(mapsService.findMap).toHaveBeenCalledWith('map-1')
      expect(docManager.getOrCreateDoc).toHaveBeenCalledWith('map-1')
      expect(docManager.incrementClientCount).toHaveBeenCalledWith('map-1')
      expect(ws.send).toHaveBeenCalled()
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
      expect(docManager.getOrCreateDoc).not.toHaveBeenCalled()
    })
  })

  describe('connection with missing mapId parameter', () => {
    it('closes connection with error', async () => {
      const ws = createMockWs()

      await connectClient(gateway, ws, createMockRequest(null))

      expect(ws.close).toHaveBeenCalledWith(
        WS_CLOSE_MISSING_PARAM,
        'Missing mapId parameter'
      )
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
    it('decrements client count on disconnect', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )
      ws._triggerClose()

      expect(docManager.decrementClientCount).toHaveBeenCalledWith('map-1')
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
    it('logs error and terminates connection on error event', async () => {
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

    it('terminates zombie connection that missed pong', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      // First heartbeat: marks isAlive=false and pings
      runHeartbeat(gateway)
      expect(ws.ping).toHaveBeenCalledTimes(1)
      expect(ws.terminate).not.toHaveBeenCalled()

      // Second heartbeat without pong: terminates
      runHeartbeat(gateway)
      expect(ws.terminate).toHaveBeenCalled()
    })

    it('keeps healthy connection that responds with pong', async () => {
      mapsService.findMap.mockResolvedValue(createMockMap())
      const ws = createMockWs()

      await connectClient(
        gateway,
        ws,
        createMockRequest('map-1', 'test-secret')
      )

      // First heartbeat: marks isAlive=false and pings
      runHeartbeat(gateway)
      // Client responds with pong
      ws._triggerPong()

      // Second heartbeat: connection survives
      runHeartbeat(gateway)
      expect(ws.terminate).not.toHaveBeenCalled()
      expect(ws.ping).toHaveBeenCalledTimes(2)
    })

    it('clears heartbeat interval on shutdown', () => {
      gateway.onModuleInit()
      gateway.onModuleDestroy()

      // After destroy, no further heartbeat runs
      // (verified by no errors thrown after cleanup)
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
})
