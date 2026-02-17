<!--
  PR Strategy
  ===========
  Each numbered section = one pull request.
  The app MUST be fully functional after each PR is merged.

  Feature flags:
  - Backend:  YJS_ENABLED env var (read by ConfigService). Default: false.
              When false, Socket.io gateway is active, Yjs gateway does not accept connections.
              When true, Yjs gateway is active and accepts connections.
              Both can coexist — Socket.io is only removed in the final PR.
  - Frontend: featureFlagYjs in environment.ts / environment.prod.ts. Default: false.
              When false, MapSyncService uses the Socket.io code path.
              When true, MapSyncService uses the Yjs code path.
              Both code paths coexist until the cleanup PR.
-->

## 1. Feature Flags & Dependencies

> **PR scope**: Add all new packages, introduce feature flags, add proxy config. No behavioral change.
> **App state after merge**: Identical to before. New dependencies installed but unused.

- [x] 1.1 Add `yjs`, `y-protocols`, `y-websocket`, and `ws` (+ `@types/ws`) to backend dependencies
- [x] 1.2 Add `yjs` and `y-websocket` to frontend dependencies
- [x] 1.3 Add `YJS_ENABLED` env var support to backend `ConfigService` (default: `false`), with a `isYjsEnabled()` method
- [x] 1.4 Add `featureFlagYjs: false` to frontend `environment.ts` and `environment.prod.ts`
- [x] 1.5 Add `/yjs` entry to frontend `proxy.conf.json` forwarding to backend with `ws: true`
- [x] 1.6 Verify both frontend and backend build, lint, and tests pass with no behavioral change

## 2. Backend: Y.Doc Management & Persistence Services

> **PR scope**: New backend services for Y.Doc lifecycle and persistence. Fully self-contained, not wired to any WebSocket endpoint yet. Gated by feature flag.
> **App state after merge**: Identical to before. New services exist but are not invoked.

- [x] 2.1 Create shared Y.Doc conversion utilities: functions to convert MmpNode entities ↔ Y.Map entries and MmpMap options ↔ Y.Map entries (reuse `mapClientNodeToMmpNode` / `mapMmpNodeToClient` patterns)
- [x] 2.2 Create `YjsDocManagerService`: maintains an in-memory `Map<string, Y.Doc>` keyed by map UUID
- [x] 2.3 Implement `getOrCreateDoc(mapId)`: returns existing Y.Doc or hydrates a new one from database by loading MmpNode rows via `MapsService.findNodes()` and MmpMap via `MapsService.findMap()`, populating `Y.Map("nodes")` and `Y.Map("mapOptions")`
- [x] 2.4 Implement client connection tracking per Y.Doc (increment/decrement count on connect/disconnect)
- [x] 2.5 Implement Y.Doc eviction: on last client disconnect, persist to DB, start a 30-second grace period timer, then evict Y.Doc from memory if no new connections arrive
- [x] 2.6 Implement `destroyDoc(mapId)`: force-destroy a Y.Doc (cancel timers, close connections) — used by map deletion
- [x] 2.7 Create `YjsPersistenceService` with `persistDoc(mapId, yDoc)`: decode Y.Doc nodes/options and write to existing MmpNode/MmpMap tables using delete-all-then-insert in a transaction (same pattern as existing `MapsService.updateMap()`)
- [x] 2.8 Implement debounced persistence: register a Y.Doc `update` observer that resets a 2-second timer, then calls `persistDoc()` on expiry
- [x] 2.9 Implement immediate persistence on last client disconnect (called before eviction grace period)
- [x] 2.10 Implement persistence error handling: log errors, do not crash, retry on next debounce cycle
- [x] 2.11 Update `lastModified` timestamps on MmpMap and MmpNode when persisting
- [x] 2.12 Write unit tests for: Y.Doc hydration from DB, Y.Doc eviction lifecycle, grace period, persistence decode, transaction atomicity, debounce coalescing, error recovery
- [x] 2.13 Verify backend builds, lints, and all tests pass

## 3. Backend: Yjs WebSocket Server & Map Deletion

> **PR scope**: New WebSocket endpoint at `/yjs` with auth. Integrate map deletion with Y.Doc cleanup. Wire new services into MapModule. Gated by `YJS_ENABLED` — when disabled, the ws.Server does not accept upgrades. Socket.io continues to work.
> **App state after merge**: Identical to before (flag is off). The `/yjs` endpoint exists but rejects connections when flag is off.

- [x] 3.1 Create `YjsGateway` NestJS provider: initialize a `ws.Server` on the NestJS HTTP server at path `/yjs`, only accepting WebSocket upgrades when `YJS_ENABLED=true`
- [x] 3.2 Implement WebSocket `connection` handler: parse `mapId` and `secret` from URL query params, validate map exists via `MapsService.findMap()`, close connection with error if map not found
- [x] 3.3 Implement authentication at handshake: verify modification secret (reuse logic from `EditGuard.validateRequest()`), tag connection as read-write or read-only
- [x] 3.4 On authenticated connection: call `YjsDocManagerService.getOrCreateDoc(mapId)` and `setupWSConnection(ws, doc)` from `y-websocket`
- [x] 3.5 Implement read-only enforcement: for read-only clients, intercept and drop incoming Y.Doc sync update messages
- [x] 3.6 Implement connection close handler: decrement client count in `YjsDocManagerService`, trigger eviction logic
- [x] 3.7 Integrate map deletion with Y.Doc: update `MapsGateway.onDeleteMap` (or `MapsController`) to call `YjsDocManagerService.destroyDoc(mapId)` which closes all WebSocket connections for that map — only when `YJS_ENABLED=true`
- [x] 3.8 Register `YjsGateway`, `YjsDocManagerService`, `YjsPersistenceService` in `MapModule` providers
- [x] 3.9 Write integration tests: WebSocket connection with valid/invalid map ID, auth with valid/invalid secret, read-only client cannot write, map deletion closes connections
- [x] 3.10 Verify backend builds, lints, and all tests pass (Socket.io gateway still active and functional)

## 4. Frontend: Yjs Bridge & Awareness (behind feature flag)

> **PR scope**: Full frontend Yjs integration behind `featureFlagYjs`. When flag is off, the existing Socket.io code path runs unchanged. When flag is on, MapSyncService uses Y.Doc + WebsocketProvider. Both code paths coexist.
> **App state after merge**: Identical to before (flag is off). Yjs path is testable by setting flag to true.

- [x] 4.1 Refactor `MapSyncService` to branch on `featureFlagYjs`: extract current Socket.io logic into a private `initSocketIo()` path, create a parallel `initYjs()` path. The `initMap()` and `listenServerEvents()` methods call one or the other based on the flag.
- [x] 4.2 In the Yjs path: create a `Y.Doc` instance and a `WebsocketProvider` connecting to `/yjs` with map UUID as room name and modification secret as `params` query parameter
- [x] 4.3 Configure `WebsocketProvider` with reconnection support (reconnectionDelay matching current Socket.io config)
- [x] 4.4 Derive connection status from `WebsocketProvider` status events (`'connected'` / `'disconnected'`) and emit to `connectionStatusSubject`
- [x] 4.5 Implement bridge — MMP events to Y.Doc writes: `nodeCreate` → set in `nodes` Y.Map, `nodeUpdate` → update Y.Map entry, `nodeRemove` → delete from Y.Map, `nodePaste` → batch add in `yDoc.transact()`, `updateMapOptions` → update `mapOptions` Y.Map
- [x] 4.6 Implement bridge — Y.Doc observations to MMP: observe `nodes` Y.Map for remote changes (add → `mmpService.addNode()`, update → `mmpService.updateNode()`, delete → `mmpService.removeNode()`), all with `notifyWithEvent: false`
- [x] 4.7 Implement echo prevention: in Y.Doc observers, check `transaction.local` and skip local changes
- [x] 4.8 Implement initial map load: on first Y.Doc sync, extract all nodes from `nodes` map, convert to `ExportNodeProperties[]`, call `mmpService.new(snapshot)` to initialize MMP
- [x] 4.9 Implement map import in Yjs path: clear and repopulate Y.Doc `nodes` map in a `yDoc.transact()` call (replacing the Socket.io `updateMap` flow)
- [x] 4.10 Implement undo/redo in Yjs path: after MMP redraws from history snapshot, write the resulting node changes (adds, updates, deletes) to Y.Doc instead of `socket.emit('applyMapChangesByDiff')`
- [x] 4.11 Implement map deletion handling in Yjs path: detect WebSocket close by server → redirect or show notification (replacing Socket.io `mapDeleted` handler)
- [x] 4.12 Implement Yjs Awareness — presence: set initial awareness state `{ color, selectedNodeId: null }` on connect, with color collision detection via `awareness.getStates()`
- [x] 4.13 Implement Yjs Awareness — selection: update `selectedNodeId` on MMP `nodeSelect`/`nodeDeselect` events
- [x] 4.14 Implement Yjs Awareness — client list: observe awareness changes, derive client colors from `awareness.getStates()`, emit to `clientListSubject`
- [x] 4.15 Implement Yjs Awareness — node highlighting: observe remote clients' `selectedNodeId` changes, call `mmpService.highlightNode()` with their color, ignore references to non-existent nodes
- [x] 4.16 Implement cleanup on destroy: disconnect `WebsocketProvider`, destroy Y.Doc, remove observers
- [x] 4.17 Verify frontend builds, lints, and unit tests pass with flag off (Socket.io path unchanged)

## 5. Integration Testing & Flag Activation

> **PR scope**: Enable the feature flags, verify end-to-end functionality with Yjs active. Both backends (Socket.io gateway + Yjs gateway) are still running, but the frontend now uses Yjs by default.
> **App state after merge**: App uses Yjs for real-time sync. Socket.io code still present but unused.

- [x] 5.1 Set `YJS_ENABLED=true` as the default in backend configuration (or `.env` / docker-compose)
- [x] 5.2 Set `featureFlagYjs: true` in `environment.ts`
- [x] 5.3 Update E2E tests to work with the Yjs WebSocket transport (update any test helpers that depend on Socket.io events or connection patterns)
- [x] 5.4 Run E2E tests (`pnpm run playwright test --reporter=list`)
- [x] 5.5 Manual smoke test: open two browser tabs on the same map and verify real-time sync of node create, update, delete, selection highlighting, undo/redo, map import, and map deletion
- [x] 5.6 Verify backend and frontend build, lint, and all tests pass

---

<!--
  PRODUCTION-BLOCKING: Tasks 6–12
  ================================
  The following hardening tasks address critical stability and security gaps
  in the Yjs WebSocket backend. They MUST be completed before enabling
  YJS_ENABLED=true in production. Without them:
  - A single connection error can crash the server process (task 6)
  - Zombie connections accumulate indefinitely (task 7)
  - No protection against connection flooding or oversized messages (tasks 6, 8)
  - Slow database responses hang connections forever (task 9)
  - Race conditions can orphan Y.Docs in memory (task 10)
  - Client count can drift causing premature/delayed eviction (task 11)
  - Map deletion errors are silently swallowed (task 12)
-->

## 6. WebSocket Error Handler and maxPayload

> **PR scope**: Add error handling on individual connections and message size limits. No behavioral change for normal clients.
> **App state after merge**: Server resilient to connection errors and oversized messages.
> **PRODUCTION-BLOCKING**: Without this, a single ECONNRESET crashes the server process.

- [x] 6.1 Add `ws.on('error')` handler in `setupSync` that logs error with mapId and calls `ws.terminate()`
- [x] 6.2 Set `maxPayload: 1_048_576` on the `WebSocketServer` constructor in `onModuleInit`
- [x] 6.3 Add unit tests: error event logs and terminates without crashing, oversized message triggers close
- [x] 6.4 Run lint, test, format — verify app still works

## 7. Ping/Pong Heartbeat

> **PR scope**: Add zombie connection detection via WebSocket ping/pong. Self-contained addition.
> **App state after merge**: Server automatically detects and cleans up zombie connections.
> **PRODUCTION-BLOCKING**: Without this, zombie connections accumulate indefinitely and leak memory.

- [x] 7.1 Add `isAlive` typed property tracking on WebSocket connections (set `true` on connect and on `pong`)
- [x] 7.2 Add 30-second `setInterval` in `onModuleInit` that iterates clients, terminates dead ones, pings live ones
- [x] 7.3 Register `ws.on('pong')` handler in `setupSync` to set `isAlive = true`
- [x] 7.4 Clear the heartbeat interval in `cleanup` / `onModuleDestroy`
- [x] 7.5 Add unit tests: zombie connection terminated after missed pong, healthy connection survives, interval cleared on shutdown
- [x] 7.6 Run lint, test, format — verify app still works

## 8. Connection Limits

> **PR scope**: Add per-IP and global connection limits to prevent resource exhaustion. Self-contained addition.
> **App state after merge**: Server rejects connections exceeding configured limits.
> **PRODUCTION-BLOCKING**: Without this, a single client can open unlimited connections and exhaust server resources.

- [ ] 8.1 Add connection limit constants to `config.service.ts` (global max 500, per-IP max 50, rate limit 10/10s) with env var overrides
- [ ] 8.2 Add in-memory tracking state to gateway: global count, per-IP count map, per-IP rate window map
- [ ] 8.3 Add limit checks in the `server.on('upgrade')` handler — reject with HTTP 503 (global) or 429 (per-IP / rate)
- [ ] 8.4 Decrement per-IP count on connection close in `handleClose`; clean up entries at zero
- [ ] 8.5 Add periodic cleanup of expired rate-limit window entries (piggyback on heartbeat interval)
- [ ] 8.6 Add unit tests: connection rejected at global limit (503), per-IP limit (429), rate limit (429); counts decrement on close; IP entry removed at zero
- [ ] 8.7 Run lint, test, format — verify app still works

## 9. Connection Setup Timeout

> **PR scope**: Add timeout on async connection setup to handle slow/unresponsive database. Self-contained addition.
> **App state after merge**: Connections that stall during setup are closed after 10 seconds.
> **PRODUCTION-BLOCKING**: Without this, slow DB responses hang connections indefinitely.

- [ ] 9.1 Wrap async operations in `handleConnection` with `Promise.race` against a 10-second timeout using `AbortController`
- [ ] 9.2 Close WebSocket with code 1013 on timeout; cancel timer on success/failure via `AbortController`
- [ ] 9.3 Add unit tests: setup completes within timeout (normal), setup exceeds timeout (closed with 1013), timer canceled on early completion
- [ ] 9.4 Run lint, test, format — verify app still works

## 10. Persistence Shutdown and Async Close Fixes

> **PR scope**: Fix persistence service shutdown lifecycle and async error handling in close handler. Fix grace timer race condition.
> **App state after merge**: Clean shutdown with no orphaned timers, no silently swallowed errors.
> **PRODUCTION-BLOCKING**: Without this, grace timer race can orphan Y.Docs in memory permanently.

- [ ] 10.1 Implement `OnModuleDestroy` in `YjsPersistenceService`: clear all debounce timers, unregister observers, best-effort flush with 5-second timeout
- [ ] 10.2 Add `.catch()` error handling on `decrementClientCount` call in `handleClose` to log persistence errors with mapId
- [ ] 10.3 Add try/finally in `handleConnection` around `getOrCreateDoc` → `trackConnection` → `incrementClientCount` to restore grace timer on failure
- [ ] 10.4 Add unit tests: persistence shutdown clears timers and flushes, decrement errors are logged not swallowed, grace timer restored on setup failure
- [ ] 10.5 Run lint, test, format — verify app still works

## 11. Unified Client Count Tracking

> **PR scope**: Refactor client count to derive from connection set (single source of truth). Touches gateway and doc manager.
> **App state after merge**: Client count always matches actual connection count — no drift possible.
> **PRODUCTION-BLOCKING**: Without this, client count drift can cause premature or delayed Y.Doc eviction.

- [ ] 11.1 Remove `clientCount` field from `DocEntry` in `yjs-doc-manager.service.ts`
- [ ] 11.2 Replace `incrementClientCount` / `decrementClientCount` with a `notifyClientCount(mapId: string, count: number)` method that accepts the count from the gateway
- [ ] 11.3 Update gateway's `handleClose` to pass `mapConnections.get(mapId)?.size ?? 0` to doc manager after removing the connection
- [ ] 11.4 Update gateway's `handleConnection` to pass connection count after `trackConnection`
- [ ] 11.5 Update `getClientCount` to accept count from gateway or return 0 if doc not tracked
- [ ] 11.6 Update existing unit tests in `yjs-doc-manager.service.spec.ts` and `yjs-gateway.service.spec.ts` for the new interface
- [ ] 11.7 Run lint, test, format — verify app still works

## 12. Async deleteMap

> **PR scope**: Make `deleteMap` properly async with awaited database calls. Small change touching callers.
> **App state after merge**: Map deletion errors properly propagate to callers.
> **PRODUCTION-BLOCKING**: Without this, deletion errors are silently swallowed and callers respond before delete completes.

- [ ] 12.1 Change `deleteMap` in `maps.service.ts` to `async deleteMap(uuid: string): Promise<void>` with `await` on the repository delete
- [ ] 12.2 Update `maps.controller.ts` to `await this.mapsService.deleteMap(mapId)`
- [ ] 12.3 Update `maps.gateway.ts` to `await this.mapsService.deleteMap(request.mapId)`
- [ ] 12.4 Update `maps.controller.spec.ts` mock to return a resolved promise
- [ ] 12.5 Run lint, test, format — verify app still works

## 13. Cleanup: Remove Socket.io & Dead Code

> **PR scope**: Remove all Socket.io code paths, dependencies, and feature flag branching. The Yjs path becomes the only path.
> **App state after merge**: App uses Yjs exclusively. Codebase is clean — no dual code paths, no unused dependencies.

- [ ] 13.1 Remove `MapsGateway` (Socket.io gateway with all `@SubscribeMessage` handlers)
- [ ] 13.2 Remove `EditGuard` (auth now at WebSocket handshake in `YjsGateway`)
- [ ] 13.3 Remove `cache-manager` client tracking logic from backend (replaced by Yjs Awareness)
- [ ] 13.4 Remove per-operation validation methods from `MapsService` that are only used by the Socket.io path (`mapConstraintErrorToValidationResponse`, `validateBusinessRules`, `handleDatabaseConstraintError`, `addNode`, `addNodes`, `addNodesFromClient`, `updateNode`, `removeNode`, `updateMapByDiff`) — keep methods used by REST API, persistence, or `updateMap`
- [ ] 13.5 Remove `@nestjs/platform-socket.io`, `socket.io`, `@nestjs/cache-manager`, and `cache-manager` from backend dependencies
- [ ] 13.6 Remove Socket.io types from backend `types.ts` that are no longer referenced (`IMmpClientNodeRequest`, `IMmpClientNodeAddRequest`, `IMmpClientUndoRedoRequest`, `IMmpClientEditingRequest`, `OperationResponse`, `ValidationErrorResponse`, etc.) — keep types still used
- [ ] 13.7 Remove the Socket.io code path from frontend `MapSyncService`: delete `initSocketIo()`, all `socket.emit` methods, all `socket.on` listener setup methods, `handleOperationResponse`, error handling helpers, `isValidServerMap`, `isValidErrorResponse`
- [ ] 13.8 Remove Socket.io types from frontend `server-types.ts` that are no longer used
- [ ] 13.9 Remove `socket.io-client` from frontend dependencies
- [ ] 13.10 Remove the `/socket.io` entry from frontend `proxy.conf.json`
- [ ] 13.11 Remove `featureFlagYjs` from frontend environments (no longer needed — Yjs is the only path)
- [ ] 13.12 Remove `YJS_ENABLED` from backend `ConfigService` and `YjsGateway` flag check (no longer needed)
- [ ] 13.13 Simplify `MapSyncService`: remove the branching logic, make the Yjs path the direct implementation
- [ ] 13.14 Verify backend and frontend build, lint, and all tests pass
- [ ] 13.15 Run E2E tests (`pnpm run playwright test --reporter=list`)
