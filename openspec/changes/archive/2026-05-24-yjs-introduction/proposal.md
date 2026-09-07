## Why

The current real-time collaboration system uses individual Socket.io messages per operation (addNode, updateNode, removeNode, etc.), each validated against the PostgreSQL database. In larger teams, clients frequently drift out of sync — e.g., a client sends an update for a node that another client already deleted, causing FK constraint violations, full-map-state reloads, and a degraded experience. There are many edge cases where local state diverges from server state, and the current last-write-wins approach with per-operation DB validation cannot resolve them reliably. Introducing Yjs (a CRDT library) as a sync layer eliminates these conflicts by design — concurrent changes merge deterministically without coordination.

Additionally, the new Yjs WebSocket backend needs hardening for production stability. An audit revealed critical gaps: no error handler on individual connections (risking process crashes), no heartbeat mechanism (causing zombie connection accumulation), no message size or connection limits (enabling resource exhaustion), and several race conditions in connection lifecycle management.

## What Changes

### Yjs Introduction
- **Replace Socket.io data sync with Yjs sync protocol**: All node/map operations (addNodes, updateNode, removeNode, applyMapChangesByDiff) stop being individual Socket.io messages. Instead, clients share a Y.Doc that syncs via y-websocket over a standard WebSocket connection.
- **Replace Socket.io presence with Yjs Awareness**: Client list, colors, and node selection tracking move from custom Socket.io events to the Yjs Awareness API.
- **Add server-side Y.Doc management**: The backend hosts Y.Doc instances per active map, loaded from DB on first client connect, evicted after last client disconnects.
- **Add decode-on-save persistence**: A debounced persistence service reads the Y.Doc, extracts nodes, and writes them to the existing MmpNode/MmpMap tables in a transaction.
- **Rewrite MapSyncService as a Y.Doc bridge**: The frontend MapSyncService becomes a two-way bridge — MMP events write to Y.Doc, Y.Doc observations apply remote changes to MMP.
- **Remove per-operation server-side validation**: The DB is no longer the real-time arbiter. Yjs handles merge correctness. The DB becomes a persistence target written to periodically.
- **Remove Socket.io dependency for data operations**: Socket.io is fully replaced by y-websocket (data sync) and Yjs Awareness (presence). **BREAKING** for any clients relying on the current Socket.io event protocol.
- **Auth moves to WebSocket handshake**: The modification secret is verified when the WebSocket connection is established, not per-message. Read-only clients can receive state but not send updates.
- **MMP library stays unchanged**: MMP keeps its internal state, rendering, and event system. It is not aware of Yjs.
- **DB schema stays unchanged**: MmpMap and MmpNode tables, all migrations, and the REST API remain as-is.
- **History/undo stays as-is (Phase 1)**: MMP's snapshot-based history continues to work locally. Undo/redo diffs are no longer broadcast over the network. Replacing with Y.UndoManager is deferred to a future change.

### WebSocket Hardening
- Add `ws.on('error')` handler to prevent unhandled errors from crashing the process
- Implement ping/pong heartbeat to detect and terminate zombie connections
- Set `maxPayload` on WebSocketServer to prevent memory exhaustion from oversized messages
- Add per-IP and global connection limits on WebSocket upgrades
- Add connection setup timeout for slow/unresponsive database scenarios
- Implement `OnModuleDestroy` in `YjsPersistenceService` to clear pending timers on shutdown
- Fix unawaited `decrementClientCount` in connection close handler
- Fix grace timer / client count increment race condition in `handleConnection`
- Unify client count tracking to derive from the connection set (single source of truth)
- Make `deleteMap` properly async with awaited database calls

## Non-goals

- Document compaction / CRDT tombstone cleanup (separate optimization effort)
- Awareness cleanup race on REST-triggered map deletion (existing defensive handling is sufficient)
- Explicit listener cleanup replacing implicit `doc.destroy()` behavior (low risk)
- Stale snapshot on rapid reconnect during grace period (self-correcting via debounced persistence)
- Frontend WebSocket client changes (beyond Yjs migration)
- Load balancing or horizontal scaling
- Replacing MMP's internal state management or history system (Phase 2)
- Storing Y.Doc binary state in the database (future optimization)
- Offline-first support or local-first persistence

## Capabilities

### New Capabilities
- `yjs-sync`: Y.Doc-based real-time synchronization — server-side Y.Doc lifecycle (load, sync, evict), y-websocket integration with NestJS, and the frontend WebsocketProvider setup.
- `yjs-persistence`: Decode-on-save persistence — debounced extraction of Y.Doc state into existing MmpNode/MmpMap tables, and hydration of Y.Doc from DB rows on first connect.
- `yjs-awareness`: Presence and selection tracking via Yjs Awareness API — client colors, connected client list, and node selection highlighting.
- `yjs-bridge`: MapSyncService rewrite — two-way bridge between MMP events and Y.Doc, replacing all Socket.io event handlers.
- `yjs-ws-connection-resilience`: Error handling on individual connections, ping/pong heartbeat for zombie detection, and connection setup timeout.
- `yjs-ws-resource-protection`: Message size limits (`maxPayload`), per-IP and global connection rate limiting, and concurrent connection caps.
- `yjs-ws-lifecycle-integrity`: Persistence service graceful shutdown, awaited async operations, grace timer race fix, unified client count tracking, and async `deleteMap`.

### Modified Capabilities
<!-- No existing specs to modify — openspec/specs/ is empty -->

## Impact

- **Frontend MapSyncService** (`map-sync.service.ts`): Heavy rewrite. All Socket.io event setup, error handling, and operation methods replaced with Y.Doc observation and writes. Socket.io client dependency removed.
- **Backend MapsGateway** (`maps.gateway.ts`): Heavy rewrite. All `@SubscribeMessage` handlers for node operations replaced by Yjs WebSocket handler. Socket.io server dependency removed.
- **Backend MapsService** (`maps.service.ts`): Simplified. Per-operation validation logic largely removed. `deleteMap` made async with awaited repository call.
- **Backend YjsGateway** (`yjs-gateway.service.ts`): Error handler, heartbeat, connection limits, timeout, await fixes.
- **Backend YjsDocManager** (`yjs-doc-manager.service.ts`): Client count refactored to derive from connection set.
- **Backend YjsPersistence** (`yjs-persistence.service.ts`): `OnModuleDestroy` added for graceful shutdown.
- **Dependencies**: Add `yjs`, `y-websocket`, `y-protocols`. Remove `socket.io`, `socket.io-client` (for data ops). Remove `cache-manager` usage for client tracking (Awareness replaces it). No new runtime dependencies for hardening.
- **REST API**: Unchanged. Map CRUD, export/import endpoints continue to work against the same DB tables.
- **APIs**: WebSocket connections may be rejected with HTTP 429/503 when limits are exceeded. Connections will receive periodic pings. Oversized messages will cause connection termination.
- **Testing**: New unit tests for error handling, heartbeat, connection limits, timeout, shutdown, and lifecycle race conditions. E2E tests updated for WebSocket transport change.
