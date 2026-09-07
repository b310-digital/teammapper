## Why

The current implementation uses a custom WebSocket message type (`MESSAGE_WRITE_ACCESS = 4`) to communicate write permissions from server to client. This causes three problems:

1. **Direct mutation of y-websocket internals**: The client sets `wsProvider.messageHandlers[4]` as a no-op to suppress `console.error('Unable to compute message')` for the unrecognized type.
2. **Fragile raw WebSocket listener**: A second `ws.addEventListener('message', ...)` is attached to parse the custom binary message, duplicating protocol handling outside y-websocket's message pipeline.
3. **Not within standard y-websocket types**: Types 0-3 are defined by y-websocket (sync, awareness, auth, queryAwareness). Type 4 is custom and could conflict with future y-websocket versions.

The client already makes an HTTP `GET /api/maps/:id` call before establishing the WebSocket connection. The modification secret is already stored in `MapSyncService` before this call. Moving write-access determination to the HTTP response eliminates the custom message type entirely.

## What Changes

- **Backend `GET /api/maps/:id`**: Accept an optional `?secret=` query parameter. Look up the map's `modificationSecret`, compute `writable` using the existing `checkWriteAccess()` utility, and return it in the response.
- **Backend Yjs gateway**: Remove the `encodeWriteAccessMessage(writable)` send from `setupSync()`. Server-side enforcement (`processReadOnlySyncMessage`) is unchanged.
- **Backend protocol utils**: Remove `MESSAGE_WRITE_ACCESS` constant and `encodeWriteAccessMessage()` function. Keep `checkWriteAccess()` (reused by both gateway and controller).
- **Frontend `fetchMapFromServer`**: Append `?secret=...` to the HTTP request URL when a modification secret is set.
- **Frontend `prepareExistingMap`**: Set `yjsWritable` from the HTTP response's `writable` field instead of waiting for a WebSocket message.
- **Frontend cleanup**: Remove `setupYjsWriteAccessListener()`, `attachWriteAccessListener()`, `parseWriteAccessMessage()`, the `MESSAGE_WRITE_ACCESS` constant, and `parseWriteAccessBytes()` from yjs-utils.

## Non-goals

- Changing the server-side enforcement mechanism (`processReadOnlySyncMessage` silently drops writes from read-only clients — this is unchanged)
- Moving the secret to an HTTP header (consistent with existing WebSocket URL pattern; can be improved later)
- Timing-safe secret comparison (low risk — the secret is a shareable edit link token, not a cryptographic credential)

## Yjs Logic (Unchanged)

- If the secret is provided and correct: allow all modifications (writable WebSocket sync)
- If no / wrong secret is provided: silently drop all write operations on the server side, but allow the normal connection for reading
- The HTTP call handles communicating the permission level to the client UI

## Capabilities

### New Capabilities
- `yjs-write-access`: HTTP-based write-access determination replacing custom WebSocket message type 4

## Impact

- **Backend `maps.controller.ts`**: Add `@Query('secret')` parameter, compute and return `writable`
- **Backend `types.ts`**: Add `writable?: boolean` to `IMmpClientMap`
- **Backend `yjs-gateway.service.ts`**: Remove `encodeWriteAccessMessage` send
- **Backend `yjsProtocol.ts`**: Remove `MESSAGE_WRITE_ACCESS`, `encodeWriteAccessMessage`
- **Frontend `server-types.ts`**: Add `writable?: boolean` to `ServerMap`
- **Frontend `map-sync.service.ts`**: Update `fetchMapFromServer`, `prepareExistingMap`; remove 3 write-access listener methods + constant
- **Frontend `yjs-utils.ts`**: Remove `MESSAGE_WRITE_ACCESS`, `parseWriteAccessBytes`
- **No new dependencies**
- **No breaking changes**: Custom message type 4 is internal to this branch
