## Context

TeamMapper is a collaborative mind mapping application (NestJS backend, Angular frontend, PostgreSQL). Real-time collaboration currently works via Socket.io: each user action (add/update/remove node) is sent as an individual message, validated against the DB, and broadcast to other clients. In larger teams this causes state divergence — clients reference nodes that no longer exist server-side, triggering FK constraint violations, full-map-state reloads, and lost edits.

The codebase has clear separation: the MMP library handles rendering (D3) and internal state, `MapSyncService` handles all network sync, `MapsGateway` handles server-side WebSocket logic, and `MapsService` handles persistence. The proposal calls for replacing the Socket.io sync layer with Yjs while keeping MMP, the DB schema, and the REST API unchanged.

The new Yjs WebSocket backend (`yjs-gateway.service.ts`, `yjs-doc-manager.service.ts`, `yjs-persistence.service.ts`) also requires hardening for production stability. The system is single-instance (no horizontal scaling), uses the `ws` library in `noServer` mode attached to NestJS's HTTP server, and persists Y.Doc state to PostgreSQL via TypeORM. An audit identified 11 actionable stability issues across these three services.

Key constraints:
- MMP library must not be modified (it stays as the renderer with its own internal state)
- DB schema (MmpMap, MmpNode tables) must remain unchanged
- History/undo replacement with Y.UndoManager is deferred to a future change
- The REST API (MapsController) continues to work against the same DB tables

## Goals / Non-Goals

**Goals:**
- Eliminate state divergence between clients by using CRDT-based synchronization
- Remove per-operation DB validation for real-time edits (DB becomes a persistence target)
- Simplify the sync architecture: one Y.Doc per map replaces ~10 Socket.io message types
- Maintain the existing DB schema for backward compatibility and REST API access
- Support the existing auth model (modification secret) at the connection level
- Preserve presence features (client colors, selection highlighting)
- Prevent process crashes from unhandled WebSocket errors
- Detect and clean up zombie connections automatically
- Protect against resource exhaustion from malicious or buggy clients
- Eliminate race conditions in connection lifecycle state management
- Ensure clean shutdown with no lost data or orphaned timers

**Non-Goals:**
- Replacing MMP's internal state management or history system (Phase 2)
- Storing Y.Doc binary state in the database (future optimization)
- Offline-first support or local-first persistence (could build on Yjs later, but not in scope)
- Changing the MMP library in any way
- Modifying the REST API or MapsController
- Multi-server / horizontal scaling (single-server Y.Doc hosting is sufficient for now)
- CRDT document compaction or tombstone cleanup
- Distributed/multi-instance connection tracking (Redis, etc.)
- Frontend client changes (beyond Yjs migration)

## Decisions

### 1. Transport: y-websocket on a separate WebSocket path

**Decision:** Use the `y-websocket` package with a raw `ws` WebSocket server mounted on the NestJS HTTP server at a dedicated path (e.g., `/yjs`). Remove Socket.io entirely.

**Alternatives considered:**
- *Socket.io adapter for Yjs*: Community packages exist but are less mature than y-websocket. Socket.io adds overhead (polling fallback, packet framing) that Yjs doesn't need.
- *y-protocols directly on NestJS WebSocket gateway*: Maximum control but requires reimplementing the sync and awareness protocols manually. Unnecessary complexity.
- *Hocuspocus server*: Full-featured Yjs server framework. Adds a large dependency for features we don't need (webhooks, extensions, auth framework). Overkill.

**Rationale:** `y-websocket` is the battle-tested reference implementation. Mounting a `ws` server on NestJS's HTTP server (`app.getHttpServer()`) is straightforward — the existing proxy config already forwards `/socket.io` with `ws: true`, and we simply change the path to `/yjs`. This avoids running a separate process.

**Implementation approach:**
- Create a `YjsGateway` NestJS provider that initializes a `ws.Server` on the shared HTTP server with `path: '/yjs'`
- On WebSocket `connection`, authenticate (see Decision 4), then call `y-websocket`'s `setupWSConnection(ws, doc, { gc: true })` utility
- Update the frontend proxy config to forward `/yjs` to the backend with `ws: true`
- Remove `@nestjs/platform-socket.io`, `socket.io`, and `socket.io-client` dependencies

### 2. Y.Doc structure: Y.Map of Y.Maps, mirroring existing node model

**Decision:** Each map's Y.Doc contains a `Y.Map("nodes")` keyed by node ID, where each value is a `Y.Map` with the same fields as `ExportNodeProperties`. A separate `Y.Map("mapOptions")` holds map-level metadata.

```
Y.Doc (one per map)
├── Y.Map("nodes")
│   ├── "<node-uuid>" → Y.Map
│   │   ├── "id"          → string
│   │   ├── "parent"      → string | null
│   │   ├── "name"        → string
│   │   ├── "isRoot"      → boolean
│   │   ├── "locked"      → boolean
│   │   ├── "detached"    → boolean
│   │   ├── "k"           → number
│   │   ├── "coordinates" → { x, y }
│   │   ├── "colors"      → { name, background, branch }
│   │   ├── "font"        → { size, weight, style }
│   │   ├── "image"       → { src, size }
│   │   └── "link"        → { href }
│   └── ...
└── Y.Map("mapOptions")
    ├── "name"             → string
    └── ...
```

**Alternatives considered:**
- *Y.Array of nodes*: Simpler, but doesn't support efficient single-node updates — the entire array entry would need replacing on any property change. Y.Map allows granular per-property conflict resolution.
- *Nested Y.Maps for sub-objects (coordinates, colors, font)*: Would allow per-field CRDT merging within sub-objects (e.g., two users changing `colors.name` and `colors.background` simultaneously). However, this adds complexity to the bridge layer and the sub-objects are small. Using plain JS objects for sub-properties is simpler and matches the existing data model directly. Can be refined later if sub-property conflicts become an issue.

**Rationale:** Y.Map of Y.Maps gives us O(1) node lookup, per-node granular updates, and automatic CRDT merging. The structure maps 1:1 to `ExportNodeProperties`, minimizing the bridge layer's conversion logic.

### 3. Persistence: Decode-on-save to existing tables

**Decision:** A debounced persistence service reads the Y.Doc, extracts all nodes, and writes them to the existing MmpNode/MmpMap tables using a delete-all-then-insert transaction. Persistence triggers on a debounce timer (2 seconds after last change) and on last-client-disconnect.

**Alternatives considered:**
- *Store Y.Doc binary (Y.encodeStateAsUpdate)*: Faster save/load, but requires a schema migration to add a binary column, and the existing REST API/queries would need a separate decode path. Deferred as future optimization.
- *Diff-based persistence (compare Y.Doc with DB, apply delta)*: More efficient for large maps, but significantly more complex. The existing `updateMap()` method already uses delete-all-then-insert, so this pattern is proven.

**Rationale:** Delete-all-then-insert in a transaction is simple, correct, and matches the existing `MapsService.updateMap()` pattern. The DB schema stays completely unchanged. The REST API and scheduled cleanup jobs continue to work without modification.

**Y.Doc lifecycle on server:**
1. First client connects to map → load nodes from DB via `MapsService.findNodes()`, hydrate a Y.Doc
2. While clients are connected → Y.Doc lives in memory, changes synced via y-websocket
3. On Y.Doc change → debounce 2s, then persist to DB
4. Last client disconnects → final persist, then evict Y.Doc from memory (with a grace period TTL of ~30s to handle quick reconnects)

### 4. Auth: Modification secret verified at WebSocket handshake

**Decision:** The modification secret is passed as a query parameter in the WebSocket URL (e.g., `ws://host/yjs?mapId=<uuid>&secret=<secret>`). The server verifies it on connection and grants read-write or read-only access. Unauthorized write attempts are silently dropped.

**Alternatives considered:**
- *Cookie-based auth*: The frontend already sends a `person_id` cookie, but this identifies the user, not the map permission. The modification secret is map-specific.
- *Auth after connection (first message)*: Adds complexity and a window where an unauthenticated client could receive data before auth completes.

**Rationale:** Query parameters are available at handshake time, allowing immediate accept/reject. The existing `EditGuard.validateRequest()` logic can be reused directly. Read-only clients (no valid secret) still connect and receive Y.Doc state for viewing, but their write messages are not applied to the server Y.Doc.

### 5. MMP integration: Bridge pattern in MapSyncService

**Decision:** MapSyncService becomes a two-way bridge. MMP is unaware of Yjs. The bridge:
- Listens to MMP events (`nodeCreate`, `nodeUpdate`, `nodeRemove`, etc.) → writes changes to the local Y.Doc
- Observes Y.Doc changes → applies remote changes to MMP via its existing API (`addNode`, `updateNode`, `removeNode`)
- Uses a flag to prevent echo loops (MMP event → Y.Doc write → Y.Doc observe → back to MMP)

**Alternatives considered:**
- *Deep MMP integration (MMP reads from Y.Doc directly)*: Cleanest architecture, but requires modifying MMP internals, violating the constraint.
- *MMP as pure renderer (strip state management)*: Even more invasive MMP changes.

**Rationale:** The bridge pattern requires zero MMP changes. MMP's `notifyWithEvent` parameter (present on `addNode`, `updateNode`, `removeNode`) already supports suppressing events for server-originated changes — the current `MapSyncService` already uses this pattern when applying Socket.io updates. The bridge simply swaps the source from Socket.io events to Y.Doc observations.

**Echo prevention:**
- When applying a remote Y.Doc change to MMP, call MMP methods with `notifyWithEvent: false` to suppress the MMP event
- When writing a local MMP event to Y.Doc, the Y.Doc `observe` callback checks `transaction.local` to distinguish local vs remote changes

### 5a. Sync progress feedback — loading toast during initial sync

**Decision:** Show a non-auto-dismissing info toast ("Syncing map...") from the moment the `WebsocketProvider` is created until the first Y.Doc sync completes (`handleFirstYjsSync`). Dismiss it in `resetYjs()` as well for cleanup on disconnect.

**Rationale:** After the race condition fix that defers edit mode until Yjs sync completes, the user sees the map rendered (from the REST API) in a read-only state with no indication that anything is loading. The toast bridges this gap. Using `toastrService.info()` with `timeOut: 0` follows the same pattern as the existing `MAP_IMPORT_IN_PROGRESS` toast. The toast ID is stored in `yjsSyncToastId` and removed via `toastrService.remove()` — simpler than a custom loading indicator and consistent with the existing UX.

**Alternatives considered:**
- *Spinner overlay on the map*: More visually prominent but requires new UI component work. The toast is lightweight and already part of the design language.
- *Disable map rendering until sync*: Would delay the initial visual, making the app feel slower. Showing the REST-loaded map with a toast is a better experience.

### 6. Presence: Yjs Awareness API

**Decision:** Use the Yjs Awareness protocol (bundled with y-websocket) for client presence, colors, and node selection. Each client sets its awareness state with `{ color, selectedNodeId, userName }`.

**Implementation:**
- On connect: `awareness.setLocalStateField('user', { color, selectedNodeId: null })`
- On node select: `awareness.setLocalStateField('user', { ...state, selectedNodeId: id })`
- Observe: `awareness.on('change', ...)` → update MMP node highlights and client list

**What this replaces:**
- Socket.io `clientListUpdated` event → `awareness.getStates()` provides all connected clients
- Socket.io `selectionUpdated` event → awareness state changes propagate automatically
- Socket.io `clientDisconnect` event → awareness automatically removes disconnected clients
- Server-side `cache-manager` client tracking → no longer needed

### 7. Map import and deletion: Special operations via Y.Doc transaction / REST

**Map import** (current `updateMap` flow):
- Instead of disconnecting all clients and replacing data: perform a Y.Doc transaction that clears the `nodes` map and repopulates it from the imported data
- Yjs syncs the new state to all clients automatically — no disconnect/reconnect needed
- MMP's bridge layer receives the Y.Doc changes and calls `mmpService.new(snapshot)` to redraw

**Map deletion:**
- Admin calls the existing REST endpoint (`DELETE /api/maps/:id`)
- Server destroys the Y.Doc instance and closes all WebSocket connections for that map
- Frontend detects WebSocket close → handles cleanup (same as current `mapDeleted` behavior)

---

### WebSocket Hardening Decisions (not yet implemented)

Decisions 8–17 address stability gaps identified in an audit of the Yjs WebSocket backend. These are required before production deployment but are not yet implemented. See tasks 6–12 for implementation plan.

---

### 8. WebSocket error handling — log-and-terminate pattern

Register `ws.on('error', handler)` in `setupSync` that logs the error and calls `ws.terminate()`. Termination (not `close()`) is deliberate — errors indicate a broken connection where the close handshake may not complete. The existing `close` handler already handles cleanup, and `terminate()` triggers it.

**Alternative considered:** Attempting recovery on certain error codes. Rejected because WebSocket errors indicate transport-level failures where the connection is already unusable.

### 9. Heartbeat — ws library ping/pong with `isAlive` flag

Use the standard `ws` ping/pong pattern: a 30-second `setInterval` on the server iterates all clients, terminates those that haven't responded since the last ping, marks survivors as `isAlive = false`, and sends a new ping. Each connection registers a `pong` listener that sets `isAlive = true`.

The interval is stored on the gateway and cleared in `onModuleDestroy`. The `isAlive` flag is stored on the WebSocket instance via a typed wrapper property.

**Why 30 seconds:** Balances responsiveness (zombie detected in 30–60s) against network overhead. This is the standard interval used by the `ws` library examples.

**Alternative considered:** Application-level heartbeat messages within the Yjs protocol. Rejected because ping/pong is a WebSocket standard (RFC 6455 §5.5.2), handled at the frame level with no application payload overhead, and `ws` provides native support.

### 10. maxPayload — 1 MiB limit on WebSocketServer

Set `maxPayload: 1_048_576` (1 MiB) in the `WebSocketServer` constructor options. The `ws` library automatically closes connections that exceed this with code 1009 (Message Too Big). No application-level enforcement needed.

**Why 1 MiB:** Yjs sync messages for mind maps are typically 1–50 KB. A 1 MiB limit provides generous headroom for large initial syncs while blocking the 100 MiB default that enables memory attacks.

### 11. Connection limits — in-memory tracking in the gateway

Add three limit mechanisms to the `upgrade` handler in `onModuleInit`:

1. **Global connection cap** (configurable, default 500): reject with HTTP 503 when exceeded
2. **Per-IP connection limit** (configurable, default 50): reject with HTTP 429 when exceeded
3. **Per-IP rate limit** (max 10 connections per 10-second window): reject rapid reconnect loops with HTTP 429

Track state using `Map<string, number>` for per-IP counts (incremented on upgrade, decremented on close) and a simple sliding-window counter for rate limiting. Clean up IP entries when counts reach zero.

**Why in-memory, not Redis:** TeamMapper is single-instance. In-memory tracking has zero latency and no external dependency. If horizontal scaling becomes a goal, this can be extracted to Redis later.

**Alternative considered:** Using a middleware library like `express-rate-limit`. Rejected because the WebSocket upgrade path bypasses Express middleware — limits must be applied in the raw `server.on('upgrade')` handler.

### 12. Connection setup timeout — Promise.race with AbortController

Wrap the async `handleConnection` database operations (`findMap`, `getOrCreateDoc`) in a `Promise.race` against a 10-second timeout. On timeout, close the WebSocket with code 1013 (Try Again Later).

Use `AbortController` to cancel the timeout timer when the operation completes successfully, avoiding timer leaks.

### 13. Client count — derive from connection set (single source of truth)

Replace the separate `clientCount` field in `DocEntry` with a method that returns `mapConnections.get(mapId)?.size ?? 0`. This eliminates the dual-tracking bug where `clientCount` in `yjs-doc-manager.service.ts` and the connection set in `yjs-gateway.service.ts` can drift.

**Approach:** Pass the connection count into `decrementClientCount` / the eviction check from the gateway rather than maintaining an independent counter. The doc manager's `getClientCount` method will accept the count from the gateway. The gateway is the sole owner of connection state.

**Alternative considered:** Making the doc manager own the connection set. Rejected because the gateway already tracks connections for broadcasting and awareness — moving that state would create a larger refactor with no benefit.

### 14. Persistence service shutdown — OnModuleDestroy with flush

Add `OnModuleDestroy` to `YjsPersistenceService`. On shutdown:
1. Clear all debounce timers
2. Unregister all doc observers
3. Flush pending persistence synchronously (best-effort) for any docs with active timers

This runs before the gateway's `onModuleDestroy` (NestJS destroys in reverse dependency order), ensuring timers don't fire after database connections close.

### 15. Grace timer race fix — try/finally in handleConnection

Wrap the `getOrCreateDoc` → `trackConnection` → `incrementClientCount` sequence in `handleConnection` with a try/finally. If an error occurs after `getOrCreateDoc` but before the connection is fully tracked, the finally block checks whether the connection was tracked and, if not, ensures the doc manager can still start its grace timer (by not leaving the doc in a state where `clientCount` was never incremented but the grace timer was already canceled).

### 16. Await decrementClientCount — add error handling

Change the `handleClose` method to properly handle the async `decrementClientCount` call. Rather than `await` (which would require making `handleClose` async and changing the event listener), add `.catch()` to log and handle persistence errors explicitly. This prevents silent error swallowing while keeping the close handler non-blocking.

### 17. Async deleteMap — await repository call

Make `deleteMap` in `MapsService` return `Promise<void>` and `await` the repository delete. Update both callers (`maps.controller.ts` line 74 and `maps.gateway.ts` line 146) to `await` the result. This is a **BREAKING** change to the method signature but all callers are already in async contexts.

## Risks / Trade-offs

**[Data loss window on server crash]** → The Y.Doc is persisted every ~2s. A server crash could lose up to 2 seconds of edits. Mitigation: This is acceptable for a collaborative mind mapping tool. The debounce interval can be tuned. Binary Y.Doc snapshots (future work) would enable faster, more frequent persistence.

**[Memory usage for large maps]** → Each active map holds a Y.Doc in server memory. Mitigation: Y.Docs are evicted after last client disconnects (with 30s grace period). For the typical TeamMapper usage (maps with tens to hundreds of nodes), memory usage is negligible. Monitor and add eviction pressure if needed.

**[History/undo is local-only in Phase 1]** → MMP's undo/redo continues to work for the local user, but undo/redo changes are no longer broadcast to other clients. This means User A's undo doesn't propagate to User B. Mitigation: This matches the behavior of most collaborative editors (Google Docs undo is also local). Replacing with Y.UndoManager in Phase 2 will give proper collaborative undo semantics.

**[Breaking change for Socket.io clients]** → Any external integration relying on the Socket.io event protocol will break. Mitigation: There are no known external integrations. The REST API (which remains unchanged) is the stable external interface.

**[No horizontal scaling]** → Y.Docs live in a single server's memory. If the app needs multiple server instances, Y.Doc state would need to be shared (e.g., via Redis pub/sub or a shared persistence layer). Mitigation: TeamMapper currently runs as a single instance. This can be addressed when/if scaling becomes necessary.

**[Sub-property conflicts on nested objects]** → Two users changing different sub-properties of the same nested object (e.g., `colors.name` vs `colors.background`) will result in last-write-wins at the object level since nested objects are stored as plain JS objects, not nested Y.Maps. Mitigation: This is a rare scenario for mind map editing. If it becomes an issue, specific nested objects can be promoted to nested Y.Maps.

**[Connection limits too aggressive]** → Make limits configurable via environment variables with sensible defaults. Log rejections at `warn` level so operators can tune.

**[Heartbeat adds network overhead]** → Ping frames are 2 bytes + framing. At 30-second intervals with typical connection counts (<100), overhead is negligible.

**[Client count refactor touches multiple files]** → The gateway and doc manager interfaces change, requiring test updates. Mitigated by keeping the change mechanical — derive count from set size instead of maintaining separately.

**[Persistence flush on shutdown may timeout]** → Use a maximum 5-second flush timeout. After that, accept data loss for in-flight debounces (the data is already persisted from the most recent `persistImmediately` on last-client-disconnect).

**[Rate limit state grows unbounded with many IPs]** → Clean up IP entries when connection count reaches zero. For the sliding-window rate limiter, expire old entries periodically (piggyback on the heartbeat interval).

## Open Questions

- **Debounce interval tuning**: Is 2 seconds the right default? Should it be configurable via settings?
- **Grace period on disconnect**: 30 seconds before Y.Doc eviction — sufficient for reconnection scenarios?
- **Map import notification**: The current flow shows a toast ("import in progress") to other clients. With Y.Doc transactions, the change is near-instant. Do we still need a notification? Could use Awareness to broadcast a transient "importing" state.
- **Configurable limits**: Should connection limits be configurable via `config.service.ts` or hardcoded? Recommendation: configurable with env vars and sensible defaults.
- **Metrics/observability**: Should we add counters for rejected connections, zombie kills, and timeout events? Useful for operators but adds scope. Recommendation: defer to a follow-up unless trivial to add.
