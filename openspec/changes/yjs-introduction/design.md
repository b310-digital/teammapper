## Context

TeamMapper is a collaborative mind mapping application (NestJS backend, Angular frontend, PostgreSQL). Real-time collaboration currently works via Socket.io: each user action (add/update/remove node) is sent as an individual message, validated against the DB, and broadcast to other clients. In larger teams this causes state divergence — clients reference nodes that no longer exist server-side, triggering FK constraint violations, full-map-state reloads, and lost edits.

The codebase has clear separation: the MMP library handles rendering (D3) and internal state, `MapSyncService` handles all network sync, `MapsGateway` handles server-side WebSocket logic, and `MapsService` handles persistence. The proposal calls for replacing the Socket.io sync layer with Yjs while keeping MMP, the DB schema, and the REST API unchanged.

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

**Non-Goals:**
- Replacing MMP's internal state management or history system (Phase 2)
- Storing Y.Doc binary state in the database (future optimization)
- Offline-first support or local-first persistence (could build on Yjs later, but not in scope)
- Changing the MMP library in any way
- Modifying the REST API or MapsController
- Multi-server / horizontal scaling (single-server Y.Doc hosting is sufficient for now)

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

## Risks / Trade-offs

**[Data loss window on server crash]** → The Y.Doc is persisted every ~2s. A server crash could lose up to 2 seconds of edits. Mitigation: This is acceptable for a collaborative mind mapping tool. The debounce interval can be tuned. Binary Y.Doc snapshots (future work) would enable faster, more frequent persistence.

**[Memory usage for large maps]** → Each active map holds a Y.Doc in server memory. Mitigation: Y.Docs are evicted after last client disconnects (with 30s grace period). For the typical TeamMapper usage (maps with tens to hundreds of nodes), memory usage is negligible. Monitor and add eviction pressure if needed.

**[History/undo is local-only in Phase 1]** → MMP's undo/redo continues to work for the local user, but undo/redo changes are no longer broadcast to other clients. This means User A's undo doesn't propagate to User B. Mitigation: This matches the behavior of most collaborative editors (Google Docs undo is also local). Replacing with Y.UndoManager in Phase 2 will give proper collaborative undo semantics.

**[Breaking change for Socket.io clients]** → Any external integration relying on the Socket.io event protocol will break. Mitigation: There are no known external integrations. The REST API (which remains unchanged) is the stable external interface.

**[No horizontal scaling]** → Y.Docs live in a single server's memory. If the app needs multiple server instances, Y.Doc state would need to be shared (e.g., via Redis pub/sub or a shared persistence layer). Mitigation: TeamMapper currently runs as a single instance. This can be addressed when/if scaling becomes necessary.

**[Sub-property conflicts on nested objects]** → Two users changing different sub-properties of the same nested object (e.g., `colors.name` vs `colors.background`) will result in last-write-wins at the object level since nested objects are stored as plain JS objects, not nested Y.Maps. Mitigation: This is a rare scenario for mind map editing. If it becomes an issue, specific nested objects can be promoted to nested Y.Maps.

## Open Questions

- **Debounce interval tuning**: Is 2 seconds the right default? Should it be configurable via settings?
- **Grace period on disconnect**: 30 seconds before Y.Doc eviction — sufficient for reconnection scenarios?
- **Map import notification**: The current flow shows a toast ("import in progress") to other clients. With Y.Doc transactions, the change is near-instant. Do we still need a notification? Could use Awareness to broadcast a transient "importing" state.
