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
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsPersistenceService } from '../services/yjs-persistence.service'
import configService from '../../config.service'
import {
  applyValidatedMapUpdate,
  MapUpdateOrigin,
  MapUpdateRejectedError,
  isRejectedMap,
} from '../utils/yjsValidation'
import { maxMessagePayload } from '../utils/yjsLimits'
import { LogThrottle } from '../utils/logThrottle'
import {
  MapUpdateRejectionReason,
  WS_CLOSE_MAP_SYNC_RESET,
  WS_CLOSE_MAP_UPDATE_REJECTED,
} from '@teammapper/shared'
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
  HEARTBEAT_INTERVAL_MS,
  CONNECTION_SETUP_TIMEOUT_MS,
  WS_CLOSE_TRY_AGAIN,
  WS_CLOSE_POLICY_VIOLATION,
  ConnectionMeta,
  extractPathname,
  parseMapId,
  offersCurrentSubprotocol,
  parseSecretSubprotocol,
  selectSubprotocol,
  checkWriteAccess,
  toUint8Array,
  encodeSyncStep1Message,
  encodeSyncStep2Message,
  encodeSyncUpdateMessage,
  encodeAwarenessMessage,
  processReadOnlySyncMessage,
  parseAwarenessClientIds,
} from '../utils/yjsProtocol'
import {
  MessageBudget,
  MapMessageBudget,
  openMessageBudget,
  openMapMessageBudget,
  currentBudget,
  addMessage,
  chargeShare,
  overrunsMap,
} from '../utils/yjsMessageBudget'

// What a rejection did to the map's clients: closed the sender alone, reset
// the map for every client, or closed a sender that may retry.
type RejectionAction = 'closed' | 'reset' | 'retry'

// `ws` raises this error code for a message above `maxPayload`, and closes
// the socket with 1009 on its own.
const isPayloadOverflow = (error: Error): boolean =>
  'code' in error && error.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'

@Injectable()
export class YjsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YjsGateway.name)
  private wss: WebSocketServer | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  // Each connection has a budget for all its messages. Each map has a budget
  // for sync messages, shared by its peers. The gateway keys both weakly, so
  // a map's budget survives reconnects for as long as the map stays loaded,
  // and the garbage collector frees it once the doc manager evicts the map.
  private readonly connectionBudgets = new WeakMap<WebSocket, MessageBudget>()
  private readonly mapBudgets = new WeakMap<Y.Doc, MapMessageBudget>()
  private readonly rejectedConnections = new WeakSet<WebSocket>()
  private readonly resetUntil = new Map<string, number>()
  // At most one rejection line per map and reason per minute
  private readonly rejectionLog = new LogThrottle()

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
    const server = this.httpAdapterHost.httpAdapter.getHttpServer()
    // The handlers below close over `wss` rather than reading `this.wss`, so
    // they see the server this call created even though `onModuleDestroy`
    // clears the field.
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: maxMessagePayload(configService.getYjsMapLimits()),
      handleProtocols: selectSubprotocol,
    })
    this.wss = wss

    server.on(
      'upgrade',
      (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (!extractPathname(request.url).startsWith('/yjs')) return

        if (
          !offersCurrentSubprotocol(request.headers['sec-websocket-protocol'])
        ) {
          socket.write(
            'HTTP/1.1 426 Upgrade Required\r\nUpgrade: websocket\r\nConnection: close\r\n\r\n'
          )
          socket.destroy()
          return
        }

        const rejection = this.limiter.checkLimits(request)
        if (rejection) {
          socket.write(
            `HTTP/1.1 ${rejection.status} ${rejection.reason}\r\n\r\n`
          )
          socket.destroy()
          return
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request)
        })
      }
    )

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
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
    for (const [mapId, until] of this.resetUntil) {
      if (until <= Date.now()) this.resetUntil.delete(mapId)
    }
    this.rejectionLog.prune()
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
      const mapId = parseMapId(req.url)
      const secret = parseSecretSubprotocol(
        req.headers['sec-websocket-protocol']
      )
      if (!mapId) {
        this.rejectConnection(ws, ip, WS_CLOSE_MISSING_PARAM, 'Missing mapId')
        return
      }

      if ((this.resetUntil.get(mapId) ?? 0) > Date.now()) {
        this.rejectConnection(
          ws,
          ip,
          WS_CLOSE_TRY_AGAIN,
          'Map sync reset; retry later'
        )
        return
      }
      const map = await this.mapsService.findMap(mapId)
      if (signal.aborted) return
      if ((this.resetUntil.get(mapId) ?? 0) > Date.now()) {
        this.rejectConnection(
          ws,
          ip,
          WS_CLOSE_TRY_AGAIN,
          'Map sync reset; retry later'
        )
        return
      }
      if (!map) {
        this.rejectConnection(ws, ip, WS_CLOSE_MAP_NOT_FOUND, 'Map not found')
        return
      }

      const doc = await this.docManager.getOrCreateDoc(mapId)
      if (
        signal.aborted ||
        isRejectedMap(doc) ||
        (this.resetUntil.get(mapId) ?? 0) > Date.now()
      ) {
        const count = this.mapConnections.get(mapId)?.size ?? 0
        this.docManager.restoreGraceTimer(mapId, count)
        if (!signal.aborted)
          this.rejectConnection(ws, ip, WS_CLOSE_MAP_SYNC_RESET, 'mapRejected')
        return
      }

      let setupComplete = false
      try {
        const writable = checkWriteAccess(map.modificationSecret, secret)
        const count = this.trackConnection(ws, mapId, writable, ip)
        await this.docManager.notifyClientCount(mapId, count)
        if (isRejectedMap(doc)) {
          setupComplete = true
          return
        }
        this.setupSync(ws, doc, mapId, writable)
        setupComplete = true
      } finally {
        if (!setupComplete) {
          const count = this.mapConnections.get(mapId)?.size ?? 0
          this.docManager.restoreGraceTimer(mapId, count)
        }
      }
    } catch (error) {
      if (signal.aborted) return
      this.logger.error(
        `Connection error: ${error instanceof Error ? error.message : String(error)}`
      )
      this.rejectConnection(ws, ip, WS_CLOSE_INTERNAL_ERROR, 'Internal error')
    }
  }

  /** Registers the socket and returns how many are now open on the map. */
  private trackConnection(
    ws: WebSocket,
    mapId: string,
    writable: boolean,
    ip: string
  ): number {
    const connections = this.mapConnections.get(mapId) ?? new Set<WebSocket>()
    this.mapConnections.set(mapId, connections)
    connections.add(ws)
    this.connectionMeta.set(ws, {
      mapId,
      writable,
      awarenessClientIds: new Set(),
      isAlive: true,
      ip,
    })
    return connections.size
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
      this.handleSocketError(ws, mapId, error)
    })

    ws.on('close', () => {
      this.handleClose(ws, mapId, awareness)
    })

    // The client may have left while the setup awaited the database. Its
    // 'close' event has fired already, so handleClose runs here to release
    // the limiter slot and report the lower client count.
    if (ws.readyState === WebSocket.CLOSED) {
      this.handleClose(ws, mapId, awareness)
      return
    }

    // Sync strategy: we proactively push the full doc state to the client
    // rather than waiting for the standard SyncStep1/SyncStep2 handshake.
    //
    // Why: handleConnection is async (DB lookup, doc creation) so the
    // ws.on('message') handler above is registered late. The y-websocket
    // client sends its SyncStep1 immediately on open, which may arrive
    // before the handler exists and get silently dropped. Without a
    // proactive push the client would never receive the doc.
    //
    // Trade-off: the proactive SyncStep2 always sends the full doc state
    // (not a diff), so reconnecting clients receive redundant data. For
    // mind-map-sized documents this is negligible. A message-buffering
    // approach would be more efficient for large documents.
    //
    // Message order:
    //   1. SyncStep1   — server state vector (triggers client's SyncStep2)
    //   2. SyncStep2   — full doc state for immediate hydration
    //   3. Awareness   — existing cursors/presence
    //
    // Write-access is communicated via the HTTP GET /api/maps/:id response.
    this.send(ws, encodeSyncStep1Message(doc))
    this.send(ws, encodeSyncStep2Message(doc))
    this.sendAwarenessStates(ws, awareness)
  }

  private handleMessage(
    ws: WebSocket,
    doc: Y.Doc,
    awareness: awarenessProtocol.Awareness,
    mapId: string,
    writable: boolean,
    data: Uint8Array
  ): void {
    if (!this.readsMessages(ws, doc)) return
    if (this.rejectsBeforeDecoding(ws, mapId, data.byteLength)) return
    try {
      this.dispatchMessage(ws, doc, awareness, mapId, writable, data)
    } catch (error) {
      this.rejectSender(ws, mapId, 'malformedUpdate', data.byteLength)
      this.logger.debug(
        `Malformed message on map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Closes the sender of a message above the map size limit or over the
   * connection budget, and returns whether it did.
   */
  private rejectsBeforeDecoding(
    ws: WebSocket,
    mapId: string,
    bytes: number
  ): boolean {
    // A message this large holds no valid change, so the gateway names it
    // before the budget, which would otherwise close it as a retry.
    if (bytes > configService.getYjsMapLimits().maxBytes) {
      this.rejectSender(ws, mapId, 'mapTooLarge', bytes)
      return true
    }
    if (this.acceptConnectionMessage(ws, bytes)) return false
    this.rejectSender(ws, mapId, 'rateLimited', bytes)
    return true
  }

  /** False for a socket or map whose messages the gateway ignores. */
  private readsMessages(ws: WebSocket, doc: Y.Doc): boolean {
    return (
      ws.readyState === WebSocket.OPEN &&
      !this.rejectedConnections.has(ws) &&
      !isRejectedMap(doc)
    )
  }

  /** Decodes the message type and passes the message to its handler. */
  private dispatchMessage(
    ws: WebSocket,
    doc: Y.Doc,
    awareness: awarenessProtocol.Awareness,
    mapId: string,
    writable: boolean,
    data: Uint8Array
  ): void {
    const decoder = decoding.createDecoder(data)
    const messageType = decoding.readVarUint(decoder)
    if (messageType === MESSAGE_AWARENESS) {
      this.handleAwarenessMessage(ws, awareness, mapId, decoder)
      return
    }
    if (messageType !== MESSAGE_SYNC) return
    if (!this.acceptMapMessage(ws, doc, data.byteLength)) {
      this.rejectSender(ws, mapId, 'rateLimited', data.byteLength)
      return
    }
    this.handleSyncMessage(ws, doc, decoder, writable, mapId, data.byteLength)
  }

  /**
   * Closes the sender of a message the gateway rejected before validation,
   * and ignores the rest of its messages. A sender over a budget may retry;
   * any other sender stops.
   */
  private rejectSender(
    ws: WebSocket,
    mapId: string,
    reason: MapUpdateRejectionReason,
    bytes: number
  ): void {
    const retries = reason === 'rateLimited'
    this.logRejection(mapId, reason, bytes, retries ? 'retry' : 'closed')
    this.rejectedConnections.add(ws)
    const code = retries
      ? WS_CLOSE_POLICY_VIOLATION
      : WS_CLOSE_MAP_UPDATE_REJECTED
    ws.close(code, reason)
  }

  /**
   * Logs a payload overflow as a map too large, and any other socket fault
   * as an error.
   */
  private handleSocketError(ws: WebSocket, mapId: string, error: Error): void {
    if (!isPayloadOverflow(error)) {
      this.logger.error(`WebSocket error on map ${mapId}: ${error.message}`)
      ws.terminate()
      return
    }
    const maxPayload = maxMessagePayload(configService.getYjsMapLimits())
    this.logRejection(mapId, 'mapTooLarge', `>${maxPayload}`, 'closed')
    this.rejectedConnections.add(ws)
    // `ws` has queued its 1009 close; terminating now could drop that frame.
    setTimeout(() => ws.terminate(), 1000).unref()
  }

  /** Writes one WARN line per map and reason per minute. */
  private logRejection(
    mapId: string,
    reason: MapUpdateRejectionReason,
    bytes: number | string,
    action: RejectionAction
  ): void {
    const suppressed = this.rejectionLog.admit(`${mapId}:${reason}`)
    if (suppressed === null) return
    const clients = this.mapConnections.get(mapId)?.size ?? 0
    const repeats = suppressed > 0 ? ` suppressed=${suppressed}` : ''
    this.logger.warn(
      `Rejected map update on map ${mapId}: reason=${reason} bytes=${bytes} clients=${clients} action=${action}${repeats}`
    )
  }

  /**
   * Charges any message, presence included, to the connection that sent it.
   * Returns false once the connection exceeds its budget.
   */
  private acceptConnectionMessage(ws: WebSocket, bytes: number): boolean {
    const limits = configService.getYjsMessageLimits()
    const budget = currentBudget(
      this.connectionBudgets,
      ws,
      limits.windowMs,
      openMessageBudget
    )
    addMessage(budget, bytes)
    return budget.count <= limits.maxMessages && budget.bytes <= limits.maxBytes
  }

  /**
   * Charges a sync message to the map, under the sending connection. Past
   * the map's limit, the gateway closes the sender only when no other
   * connection sent more within the window, so lighter peers stay connected. Each share
   * belongs to one connection, because behind a reverse proxy every peer can
   * arrive from the same client IP.
   */
  private acceptMapMessage(ws: WebSocket, doc: Y.Doc, bytes: number): boolean {
    const { windowMs, maxMessages, maxBytes } =
      configService.getYjsMessageLimits()
    const budget = currentBudget(
      this.mapBudgets,
      doc,
      windowMs,
      openMapMessageBudget
    )
    const share = chargeShare(budget, ws, bytes)
    return !(
      overrunsMap(budget, share, 'count', maxMessages) ||
      overrunsMap(budget, share, 'bytes', maxBytes)
    )
  }

  private handleSyncMessage(
    ws: WebSocket,
    doc: Y.Doc,
    decoder: decoding.Decoder,
    writable: boolean,
    mapId: string,
    bytes: number
  ): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)

    if (writable) {
      this.readWritableSyncMessage(ws, doc, decoder, encoder, mapId, bytes)
    } else {
      processReadOnlySyncMessage(decoder, encoder, doc)
    }

    if (encoding.length(encoder) > 1) {
      this.send(ws, encoding.toUint8Array(encoder))
    }
  }

  /**
   * Answers a state vector, or applies an update. Throws for a sync type or
   * trailing data that no client sends.
   */
  private readWritableSyncMessage(
    ws: WebSocket,
    doc: Y.Doc,
    decoder: decoding.Decoder,
    encoder: encoding.Encoder,
    mapId: string,
    bytes: number
  ): void {
    const syncType = decoding.readVarUint(decoder)
    if (syncType === syncProtocol.messageYjsSyncStep1) {
      syncProtocol.readSyncStep1(decoder, encoder, doc)
      return
    }
    if (
      syncType !== syncProtocol.messageYjsSyncStep2 &&
      syncType !== syncProtocol.messageYjsUpdate
    ) {
      throw new Error('Unknown sync message')
    }
    const update = decoding.readVarUint8Array(decoder)
    if (decoding.hasContent(decoder)) throw new Error('Trailing sync data')
    this.applyUpdate(ws, doc, update, mapId, bytes)
  }

  /** Applies a validated update, or resets the map when validation rejects it. */
  private applyUpdate(
    ws: WebSocket,
    doc: Y.Doc,
    update: Uint8Array,
    mapId: string,
    bytes: number
  ): void {
    try {
      applyValidatedMapUpdate(doc, update, ws, configService.getYjsMapLimits())
    } catch (error) {
      // applyValidatedMapUpdate throws only MapUpdateRejectedError.
      if (!(error instanceof MapUpdateRejectedError)) throw error
      this.resetMap(mapId, ws, error.reason, bytes)
    }
  }

  /**
   * Discards a map whose state validation rejected. The sender stops with
   * the reason; every other client reconnects to the reloaded map.
   */
  private resetMap(
    mapId: string,
    sender: WebSocket,
    reason: MapUpdateRejectionReason,
    bytes: number
  ): void {
    this.logRejection(mapId, reason, bytes, 'reset')
    this.resetUntil.set(
      mapId,
      Date.now() + configService.getYjsMessageLimits().windowMs
    )
    const connections = this.detachConnections(mapId)
    this.cleanupMapResources(mapId)
    this.docManager.destroyDoc(mapId)
    this.closeResetConnections(connections, sender, reason)
  }

  /** Closes the sender as rejected and every other socket as reset. */
  private closeResetConnections(
    connections: Set<WebSocket>,
    sender: WebSocket,
    reason: MapUpdateRejectionReason
  ): void {
    for (const ws of connections) {
      const code =
        ws === sender ? WS_CLOSE_MAP_UPDATE_REJECTED : WS_CLOSE_MAP_SYNC_RESET
      ws.close(code, reason)
      // A peer ignoring the close handshake must not keep rejected state
      // alive through the message handlers captured by its socket.
      setTimeout(() => ws.terminate(), 1000).unref()
    }
  }

  /**
   * Removes a map's sockets from the gateway and returns them. Their close
   * callbacks then cannot persist rejected state or clean up resources that
   * belong to the reloaded map.
   */
  private detachConnections(mapId: string): Set<WebSocket> {
    const connections = this.mapConnections.get(mapId) ?? new Set<WebSocket>()
    this.mapConnections.delete(mapId)
    for (const ws of connections) {
      const meta = this.connectionMeta.get(ws)
      if (meta) this.limiter.releaseConnection(meta.ip)
      this.connectionMeta.delete(ws)
      this.rejectedConnections.add(ws)
    }
    return connections
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
    if (!meta) return

    if (meta.awarenessClientIds.size > 0) {
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
    }

    const remainingCount = this.mapConnections.get(mapId)?.size ?? 0

    if (remainingCount === 0) {
      this.mapConnections.delete(mapId)
      this.cleanupMapResources(mapId)
    }

    this.docManager.notifyClientCount(mapId, remainingCount).catch((error) => {
      this.logger.error(
        `Persistence error during disconnect for map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
      )
    })
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
      if (origin instanceof MapUpdateOrigin && !origin.accepted) return
      const sender = origin instanceof MapUpdateOrigin ? origin.sender : origin
      const message = encodeSyncUpdateMessage(update)
      this.broadcastToMap(
        mapId,
        message,
        sender instanceof WebSocket ? sender : null
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
    this.resetUntil.clear()
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
