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

## 6. Cleanup: Remove Socket.io & Dead Code

> **PR scope**: Remove all Socket.io code paths, dependencies, and feature flag branching. The Yjs path becomes the only path.
> **App state after merge**: App uses Yjs exclusively. Codebase is clean — no dual code paths, no unused dependencies.

- [ ] 6.1 Remove `MapsGateway` (Socket.io gateway with all `@SubscribeMessage` handlers)
- [ ] 6.2 Remove `EditGuard` (auth now at WebSocket handshake in `YjsGateway`)
- [ ] 6.3 Remove `cache-manager` client tracking logic from backend (replaced by Yjs Awareness)
- [ ] 6.4 Remove per-operation validation methods from `MapsService` that are only used by the Socket.io path (`mapConstraintErrorToValidationResponse`, `validateBusinessRules`, `handleDatabaseConstraintError`, `addNode`, `addNodes`, `addNodesFromClient`, `updateNode`, `removeNode`, `updateMapByDiff`) — keep methods used by REST API, persistence, or `updateMap`
- [ ] 6.5 Remove `@nestjs/platform-socket.io`, `socket.io`, `@nestjs/cache-manager`, and `cache-manager` from backend dependencies
- [ ] 6.6 Remove Socket.io types from backend `types.ts` that are no longer referenced (`IMmpClientNodeRequest`, `IMmpClientNodeAddRequest`, `IMmpClientUndoRedoRequest`, `IMmpClientEditingRequest`, `OperationResponse`, `ValidationErrorResponse`, etc.) — keep types still used
- [ ] 6.7 Remove the Socket.io code path from frontend `MapSyncService`: delete `initSocketIo()`, all `socket.emit` methods, all `socket.on` listener setup methods, `handleOperationResponse`, error handling helpers, `isValidServerMap`, `isValidErrorResponse`
- [ ] 6.8 Remove Socket.io types from frontend `server-types.ts` that are no longer used
- [ ] 6.9 Remove `socket.io-client` from frontend dependencies
- [ ] 6.10 Remove the `/socket.io` entry from frontend `proxy.conf.json`
- [ ] 6.11 Remove `featureFlagYjs` from frontend environments (no longer needed — Yjs is the only path)
- [ ] 6.12 Remove `YJS_ENABLED` from backend `ConfigService` and `YjsGateway` flag check (no longer needed)
- [ ] 6.13 Simplify `MapSyncService`: remove the branching logic, make the Yjs path the direct implementation
- [ ] 6.14 Verify backend and frontend build, lint, and all tests pass
- [ ] 6.15 Run E2E tests (`pnpm run playwright test --reporter=list`)
