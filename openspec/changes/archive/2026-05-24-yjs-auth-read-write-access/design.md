## Context

When a client connects to a TeamMapper map, it needs to know whether it has write access (correct modification secret) or is read-only. The current implementation sends this as a custom WebSocket binary message (type 4) before the Yjs sync messages. The client must hack y-websocket's `messageHandlers` array to prevent console errors and attach a raw WebSocket listener to parse the message.

The `GET /api/maps/:id` HTTP call already happens before the WebSocket connection is established. The modification secret is already available in `MapSyncService.modificationSecret` before `fetchMapFromServer` is called (set in `prepareExistingMap`). This makes the HTTP response the natural place to communicate write-access status.

Server-side enforcement is completely independent: `processReadOnlySyncMessage` in the Yjs gateway drops SyncStep2/Update messages from read-only clients regardless of how the client learns its permission level. This is the real security boundary and is unchanged.

## Goals / Non-Goals

**Goals:**
- Eliminate custom WebSocket message type 4
- Remove y-websocket `messageHandlers` mutation
- Remove raw WebSocket `addEventListener` hack
- Communicate write-access via existing HTTP endpoint
- Keep server-side enforcement unchanged

**Non-Goals:**
- Changing how the secret is stored or transmitted to the WebSocket (stays as query param)
- Implementing timing-safe comparison (low risk, deferred)
- Modifying the `HttpService` class (secret appended to URL string directly)

## Decisions

### 1. Secret passed as query parameter on HTTP GET

**Decision:** Append `?secret=<encoded_secret>` to the `GET /api/maps/:id` URL when a modification secret is available. Use `encodeURIComponent()` for safety.

**Rationale:** The secret is already passed as a query parameter in the WebSocket URL (`params: { secret: ... }`). Using the same pattern for the HTTP call is consistent. The `HttpService.get()` method only accepts `(apiUrl, endpoint)` — no headers/options support — so appending to the URL string is the simplest approach without modifying the service.

**Alternative considered:** Adding headers support to `HttpService`. Rejected — over-engineering for this use case, and inconsistent with the WebSocket path which also uses query params.

### 2. `writable` computed in the controller, not the service

**Decision:** The `maps.controller.ts` `findOne` endpoint accepts the `@Query('secret')` parameter, calls `mapsService.findMap()` to get the `modificationSecret`, and uses `checkWriteAccess()` to compute `writable`. The result is spread into the response: `{ ...map, writable }`.

**Rationale:** The `MapsService.exportMapToClient()` method is a generic export function used by multiple endpoints (create, duplicate, etc.). Adding secret-awareness to it would conflate concerns. The controller is the right place to handle request-specific parameters.

**Trade-off:** `findMap()` is called separately from `exportMapToClient()` (which calls it internally via `updateLastAccessed`). This means two DB lookups for the same map. Acceptable because it's a simple PK lookup and avoids modifying the service interface.

### 3. `writable` defaults to `true` when absent

**Decision:** Frontend treats `serverMap.writable !== false` as writable. This means if the field is `undefined` (e.g., from a cached response or older server), the client defaults to writable and relies on server-side enforcement.

**Rationale:** Fail-open on the client is safe because the server enforces read-only at the WebSocket level. A client that thinks it's writable but isn't will simply have its writes silently dropped. This is better than fail-closed (defaulting to read-only), which would lock out users unnecessarily.

### 4. Removal scope: all custom message type 4 code

**Decision:** Remove all code related to `MESSAGE_WRITE_ACCESS` (type 4) from both frontend and backend:

**Backend removals:**
- `yjsProtocol.ts`: `MESSAGE_WRITE_ACCESS` constant, `encodeWriteAccessMessage()` function
- `yjs-gateway.service.ts`: `this.send(ws, encodeWriteAccessMessage(writable))` line in `setupSync()`

**Frontend removals:**
- `yjs-utils.ts`: `MESSAGE_WRITE_ACCESS` constant, `parseWriteAccessBytes()` function
- `map-sync.service.ts`: `MESSAGE_WRITE_ACCESS` constant (line 64), `setupYjsWriteAccessListener()`, `attachWriteAccessListener()`, `parseWriteAccessMessage()`, and the call site `this.setupYjsWriteAccessListener()` in `setupYjsConnection`

**Kept:**
- `checkWriteAccess()` in `yjsProtocol.ts` — reused by both the gateway (server-side enforcement) and the controller (HTTP response)
- `processReadOnlySyncMessage()` — server-side enforcement unchanged
- WebSocket `secret` query param — still used for server-side write enforcement

## Data Flow

```
BEFORE (custom WebSocket message):
┌────────┐  GET /api/maps/:id   ┌────────┐
│ Client │─────────────────────▶│ Server │  (no write-access info)
│        │◀─────────────────────│        │
│        │                      │        │
│        │  WS connect          │        │
│        │─────────────────────▶│        │
│        │◀── msg type 4 ───── │        │  encodeWriteAccessMessage(writable)
│        │◀── SyncStep1 ────── │        │
│        │◀── SyncStep2 ────── │        │
│        │  messageHandlers[4]  │        │  (client hacks y-websocket)
│        │  ws.addEventListener │        │  (client attaches raw listener)
└────────┘                      └────────┘

AFTER (HTTP-based):
┌────────┐  GET /api/maps/:id?secret=...  ┌────────┐
│ Client │────────────────────────────────▶│ Server │
│        │◀── { ...map, writable } ───────│        │  checkWriteAccess()
│        │                                 │        │
│        │  WS connect                     │        │
│        │────────────────────────────────▶│        │
│        │◀── SyncStep1 ─────────────────  │        │  (no custom message)
│        │◀── SyncStep2 ─────────────────  │        │
│        │  (no messageHandlers hack)      │        │
│        │  (no raw WS listener)           │        │
└────────┘                                 └────────┘
```

## Risks / Trade-offs

**[Double DB lookup in findOne]** The controller calls both `exportMapToClient()` (which internally calls `findMap()`) and `findMap()` directly. This is two PK lookups for the same row. Mitigation: PK lookups are fast and cached by the DB. Can be optimized later by extracting the map entity from `exportMapToClient` if needed.

**[Secret in query string]** The secret appears in URL query parameters, which may be logged by proxies or appear in browser history. Mitigation: Already the case for the WebSocket URL. Can be moved to a header in a future iteration.

**[Race between HTTP and WebSocket]** If the map's `modificationSecret` changes between the HTTP call and WebSocket connection, the client could have stale permission info. Mitigation: The server enforces permissions on every WebSocket message via `processReadOnlySyncMessage`. The client's `writable` flag only affects UI state (edit mode), not actual security.
