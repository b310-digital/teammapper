import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import configService from '../../config.service'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsPersistenceService } from '../services/yjs-persistence.service'
import { MapsService } from '../services/maps.service'
import { WsConnectionLimiterService } from '../services/ws-connection-limiter.service'
import {
  MESSAGE_SYNC,
  MESSAGE_AWARENESS,
  WS_CLOSE_MISSING_PARAM,
  WS_CLOSE_MAP_DELETED,
  WS_CLOSE_MAP_NOT_FOUND,
  WS_CLOSE_INTERNAL_ERROR,
  WS_CLOSE_SERVER_SHUTDOWN,
  WS_MAX_PAYLOAD,
  HEARTBEAT_INTERVAL_MS,
  CONNECTION_SETUP_TIMEOUT_MS,
  WS_CLOSE_TRY_AGAIN,
  ConnectionMeta,
  extractPathname,
  parseQueryParams,
  checkWriteAccess,
  toUint8Array,
  encodeSyncStep1Message,
  encodeSyncUpdateMessage,
  encodeAwarenessMessage,
  encodeWriteAccessMessage,
  processReadOnlySyncMessage,
  parseAwarenessClientIds,
} from '../utils/yjsProtocol'

@Injectable()
export class YjsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YjsGateway.name)
  private wss: WebSocketServer | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  // Connections per map
  private readonly mapConnections = new Map<string, Set<WebSocket>>()
  // Metadata per connection
  private readonly connectionMeta = new Map<WebSocket, ConnectionMeta>()
  // Awareness instances per map
  private readonly awarenessInstances = new Map<
    string,
    awarenessProtocol.Awareness
  >()
  // Doc update handlers per map (for cleanup)
  private readonly docUpdateHandlers = new Map<
    string,
    (update: Uint8Array, origin: unknown) => void
  >()

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly docManager: YjsDocManagerService,
    private readonly persistenceService: YjsPersistenceService,
    private readonly mapsService: MapsService,
    private readonly limiter: WsConnectionLimiterService
  ) {}

  onModuleInit(): void {
    if (!configService.isYjsEnabled()) {
      this.logger.log('Yjs disabled, skipping WebSocket server setup')
      return
    }

    const server = this.httpAdapterHost.httpAdapter.getHttpServer()
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: WS_MAX_PAYLOAD,
    })

    server.on(
      'upgrade',
      (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (!extractPathname(request.url).startsWith('/yjs')) return

        const rejection = this.limiter.checkLimits(request)
        if (rejection) {
          socket.write(
            `HTTP/1.1 ${rejection.status} ${rejection.reason}\r\n\r\n`
          )
          socket.destroy()
          return
        }

        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request)
        })
      }
    )

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req).catch((err) =>
        this.logger.error(
          `Unhandled connection error: ${err instanceof Error ? err.message : String(err)}`
        )
      )
    })

    this.heartbeatInterval = setInterval(
      () => this.runHeartbeat(),
      HEARTBEAT_INTERVAL_MS
    )

    this.logger.log('Yjs WebSocket server started on /yjs')
  }

  onModuleDestroy(): void {
    this.cleanup()
  }

  // Close all WebSocket connections for a specific map (used on map deletion)
  closeConnectionsForMap(mapId: string): void {
    const connections = this.mapConnections.get(mapId)
    if (!connections) return

    for (const ws of connections) {
      ws.close(WS_CLOSE_MAP_DELETED, 'Map deleted')
    }
  }

  private runHeartbeat(): void {
    const zombies: WebSocket[] = []

    for (const [ws, meta] of this.connectionMeta) {
      if (!meta.isAlive) {
        zombies.push(ws)
        continue
      }

      this.connectionMeta.set(ws, { ...meta, isAlive: false })
      ws.ping()
    }

    for (const ws of zombies) {
      ws.terminate()
    }

    this.limiter.cleanupExpiredRateWindows()
  }

  private async handleConnection(
    ws: WebSocket,
    req: IncomingMessage
  ): Promise<void> {
    const ip = this.limiter.getClientIp(req)
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONNECTION_SETUP_TIMEOUT_MS
    )

    try {
      await Promise.race([
        this.performConnectionSetup(ws, ip, req, controller.signal),
        this.rejectOnAbort(controller.signal),
      ])
    } catch {
      this.limiter.releaseConnection(ip)
      ws.close(WS_CLOSE_TRY_AGAIN, 'Connection setup timeout')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private rejectOnAbort(signal: AbortSignal): Promise<never> {
    return new Promise<never>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new Error('Connection setup timeout')),
        { once: true }
      )
    })
  }

  private rejectConnection(
    ws: WebSocket,
    ip: string,
    code: number,
    reason: string
  ): void {
    this.limiter.releaseConnection(ip)
    ws.close(code, reason)
  }

  private async performConnectionSetup(
    ws: WebSocket,
    ip: string,
    req: IncomingMessage,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const { mapId, secret } = parseQueryParams(req.url)
      if (!mapId) {
        this.rejectConnection(ws, ip, WS_CLOSE_MISSING_PARAM, 'Missing mapId')
        return
      }

      const map = await this.mapsService.findMap(mapId)
      if (signal.aborted) return
      if (!map) {
        this.rejectConnection(ws, ip, WS_CLOSE_MAP_NOT_FOUND, 'Map not found')
        return
      }

      const doc = await this.docManager.getOrCreateDoc(mapId)
      if (signal.aborted) return

      const writable = checkWriteAccess(map.modificationSecret, secret)
      this.trackConnection(ws, mapId, writable, ip)
      this.docManager.incrementClientCount(mapId)
      this.setupSync(ws, doc, mapId, writable)
    } catch (error) {
      if (signal.aborted) return
      this.logger.error(
        `Connection error: ${error instanceof Error ? error.message : String(error)}`
      )
      this.rejectConnection(ws, ip, WS_CLOSE_INTERNAL_ERROR, 'Internal error')
    }
  }

  private trackConnection(
    ws: WebSocket,
    mapId: string,
    writable: boolean,
    ip: string
  ): void {
    if (!this.mapConnections.has(mapId)) {
      this.mapConnections.set(mapId, new Set())
    }
    this.mapConnections.get(mapId)!.add(ws)
    this.connectionMeta.set(ws, {
      mapId,
      writable,
      awarenessClientIds: new Set(),
      isAlive: true,
      ip,
    })
  }

  private getOrCreateAwareness(
    mapId: string,
    doc: Y.Doc
  ): awarenessProtocol.Awareness {
    const existing = this.awarenessInstances.get(mapId)
    if (existing) return existing

    const awareness = new awarenessProtocol.Awareness(doc)
    awareness.setLocalState(null)
    this.setupAwarenessBroadcast(mapId, awareness)
    this.awarenessInstances.set(mapId, awareness)
    return awareness
  }

  private setupAwarenessBroadcast(
    mapId: string,
    awareness: awarenessProtocol.Awareness
  ): void {
    awareness.on(
      'update',
      ({
        added,
        updated,
        removed,
      }: {
        added: number[]
        updated: number[]
        removed: number[]
      }) => {
        const changedClients = [...added, ...updated, ...removed]
        if (changedClients.length === 0) return

        const message = encodeAwarenessMessage(awareness, changedClients)
        this.broadcastToMap(mapId, message, null)
      }
    )
  }

  private setupSync(
    ws: WebSocket,
    doc: Y.Doc,
    mapId: string,
    writable: boolean
  ): void {
    const awareness = this.getOrCreateAwareness(mapId, doc)

    this.ensureDocUpdateHandler(mapId, doc)
    this.persistenceService.registerDebounce(mapId, doc)

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      this.handleMessage(
        ws,
        doc,
        awareness,
        mapId,
        writable,
        toUint8Array(data)
      )
    })

    ws.on('pong', () => {
      const meta = this.connectionMeta.get(ws)
      if (meta) this.connectionMeta.set(ws, { ...meta, isAlive: true })
    })

    ws.on('error', (error: Error) => {
      this.logger.error(`WebSocket error on map ${mapId}: ${error.message}`)
      ws.terminate()
    })

    ws.on('close', () => {
      this.handleClose(ws, mapId, awareness)
    })

    this.send(ws, encodeSyncStep1Message(doc))
    this.sendAwarenessStates(ws, awareness)
    this.send(ws, encodeWriteAccessMessage(writable))
  }

  private handleMessage(
    ws: WebSocket,
    doc: Y.Doc,
    awareness: awarenessProtocol.Awareness,
    mapId: string,
    writable: boolean,
    data: Uint8Array
  ): void {
    try {
      const decoder = decoding.createDecoder(data)
      const messageType = decoding.readVarUint(decoder)

      switch (messageType) {
        case MESSAGE_SYNC:
          this.handleSyncMessage(ws, doc, decoder, writable)
          break
        case MESSAGE_AWARENESS:
          this.handleAwarenessMessage(ws, awareness, mapId, decoder)
          break
      }
    } catch (error) {
      this.logger.error(
        `Message handling error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private handleSyncMessage(
    ws: WebSocket,
    doc: Y.Doc,
    decoder: decoding.Decoder,
    writable: boolean
  ): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)

    if (writable) {
      syncProtocol.readSyncMessage(decoder, encoder, doc, null)
    } else {
      processReadOnlySyncMessage(decoder, encoder, doc)
    }

    if (encoding.length(encoder) > 1) {
      this.send(ws, encoding.toUint8Array(encoder))
    }
  }

  private handleAwarenessMessage(
    ws: WebSocket,
    awareness: awarenessProtocol.Awareness,
    mapId: string,
    decoder: decoding.Decoder
  ): void {
    const update = decoding.readVarUint8Array(decoder)
    const meta = this.connectionMeta.get(ws)

    this.trackAwarenessClients(meta, update)
    awarenessProtocol.applyAwarenessUpdate(awareness, update, ws)
  }

  private trackAwarenessClients(
    meta: ConnectionMeta | undefined,
    update: Uint8Array
  ): void {
    if (!meta) return
    try {
      for (const clientId of parseAwarenessClientIds(update)) {
        meta.awarenessClientIds.add(clientId)
      }
    } catch (error) {
      this.logger.debug(
        `Awareness tracking parse error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private handleClose(
    ws: WebSocket,
    mapId: string,
    awareness: awarenessProtocol.Awareness
  ): void {
    const meta = this.connectionMeta.get(ws)

    if (meta && meta.awarenessClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        awareness,
        Array.from(meta.awarenessClientIds),
        null
      )
    }

    if (meta) {
      this.limiter.releaseConnection(meta.ip)
    }

    this.connectionMeta.delete(ws)
    const connections = this.mapConnections.get(mapId)
    if (connections) {
      connections.delete(ws)
      if (connections.size === 0) {
        this.mapConnections.delete(mapId)
        this.cleanupMapResources(mapId)
      }
    }

    this.docManager.decrementClientCount(mapId)
  }

  private cleanupMapResources(mapId: string): void {
    const handler = this.docUpdateHandlers.get(mapId)
    if (handler) {
      const doc = this.docManager.getDoc(mapId)
      if (doc) doc.off('update', handler)
      this.docUpdateHandlers.delete(mapId)
    }

    const awareness = this.awarenessInstances.get(mapId)
    if (awareness) {
      awareness.destroy()
      this.awarenessInstances.delete(mapId)
    }

    this.persistenceService.unregisterDebounce(mapId)
  }

  private ensureDocUpdateHandler(mapId: string, doc: Y.Doc): void {
    if (this.docUpdateHandlers.has(mapId)) return

    const handler = (update: Uint8Array, origin: unknown): void => {
      const message = encodeSyncUpdateMessage(update)
      this.broadcastToMap(
        mapId,
        message,
        origin instanceof WebSocket ? origin : null
      )
    }

    doc.on('update', handler)
    this.docUpdateHandlers.set(mapId, handler)
  }

  private sendAwarenessStates(
    ws: WebSocket,
    awareness: awarenessProtocol.Awareness
  ): void {
    const states = awareness.getStates()
    if (states.size === 0) return

    this.send(ws, encodeAwarenessMessage(awareness, Array.from(states.keys())))
  }

  private broadcastToMap(
    mapId: string,
    message: Uint8Array,
    exclude: WebSocket | null
  ): void {
    const connections = this.mapConnections.get(mapId)
    if (!connections) return

    for (const ws of connections) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        this.send(ws, message)
      }
    }
  }

  private send(ws: WebSocket, message: Uint8Array): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message, (err) => {
        if (err) {
          this.logger.error(`Send error: ${err.message}`)
        }
      })
    }
  }

  private cleanup(): void {
    for (const [mapId, connections] of this.mapConnections) {
      for (const ws of connections) {
        ws.close(WS_CLOSE_SERVER_SHUTDOWN, 'Server shutting down')
      }
      this.cleanupMapResources(mapId)
    }
    this.mapConnections.clear()
    this.connectionMeta.clear()
    this.limiter.reset()

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
  }
}
