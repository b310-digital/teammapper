## ADDED Requirements

### Requirement: HTTP-based write-access determination
The `GET /api/maps/:id` endpoint SHALL accept an optional `secret` query parameter. When provided, the server SHALL compare it against the map's `modificationSecret` using the existing `checkWriteAccess()` utility and return a `writable` boolean field in the response.

#### Scenario: Map with no modification secret
- **WHEN** a client requests `GET /api/maps/:id` for a map that has no `modificationSecret`
- **THEN** the response SHALL include `writable: true`
- **AND** this SHALL be the case regardless of whether `?secret=` is provided

#### Scenario: Map with correct secret
- **WHEN** a client requests `GET /api/maps/:id?secret=<correct_secret>`
- **AND** the map has a `modificationSecret` that matches the provided secret
- **THEN** the response SHALL include `writable: true`

#### Scenario: Map with wrong or missing secret
- **WHEN** a client requests `GET /api/maps/:id` without a `secret` parameter (or with an incorrect one)
- **AND** the map has a `modificationSecret`
- **THEN** the response SHALL include `writable: false`

### Requirement: Frontend reads write-access from HTTP response
When the frontend fetches a map via `fetchMapFromServer`, it SHALL pass the stored `modificationSecret` as a `?secret=` query parameter (URL-encoded). The `prepareExistingMap` method SHALL set `yjsWritable` from the response's `writable` field before the WebSocket connection is established.

#### Scenario: Secret passed in HTTP request
- **WHEN** `modificationSecret` is set in `MapSyncService`
- **AND** `fetchMapFromServer` is called
- **THEN** the HTTP request URL SHALL include `?secret=<encoded_secret>`

#### Scenario: No secret omits query parameter
- **WHEN** `modificationSecret` is empty or null
- **AND** `fetchMapFromServer` is called
- **THEN** the HTTP request URL SHALL NOT include a `secret` query parameter

#### Scenario: writable set from HTTP response
- **WHEN** `prepareExistingMap` receives the server response
- **THEN** `yjsWritable` SHALL be set to `serverMap.writable !== false`
- **AND** `yjsWritable` SHALL be set BEFORE the WebSocket connection is established

#### Scenario: writable defaults to true when absent
- **WHEN** the server response does not include a `writable` field
- **THEN** `yjsWritable` SHALL default to `true`
- **AND** server-side enforcement SHALL still apply (client writes silently dropped if unauthorized)

### Requirement: Removal of custom WebSocket message type 4
The custom `MESSAGE_WRITE_ACCESS` (type 4) WebSocket message SHALL be removed from both frontend and backend. The server SHALL NOT send write-access messages over WebSocket. The client SHALL NOT register custom message handlers or raw WebSocket listeners for write-access.

#### Scenario: Server does not send write-access message
- **WHEN** a WebSocket connection is established in `setupSync()`
- **THEN** the server SHALL NOT call `encodeWriteAccessMessage()` or send a type 4 message
- **AND** the server SHALL still send SyncStep1, SyncStep2, and awareness messages

#### Scenario: Client does not hack messageHandlers
- **WHEN** the `WebsocketProvider` is created
- **THEN** the client SHALL NOT modify `wsProvider.messageHandlers[4]`
- **AND** the client SHALL NOT attach raw `ws.addEventListener('message', ...)` listeners for write-access parsing

#### Scenario: Protocol utils cleaned up
- **WHEN** the codebase is updated
- **THEN** `MESSAGE_WRITE_ACCESS` and `encodeWriteAccessMessage()` SHALL NOT exist in `yjsProtocol.ts`
- **AND** `MESSAGE_WRITE_ACCESS` and `parseWriteAccessBytes()` SHALL NOT exist in `yjs-utils.ts`
- **AND** `checkWriteAccess()` SHALL remain in `yjsProtocol.ts` (used by gateway and controller)

### Requirement: Server-side enforcement unchanged
The `processReadOnlySyncMessage` function in the Yjs gateway SHALL continue to silently drop SyncStep2 and Update messages from read-only clients. This is the security boundary and is NOT affected by the move from WebSocket to HTTP for permission signaling.

#### Scenario: Read-only client writes are dropped
- **WHEN** a client connected without a valid secret sends a Y.Doc update
- **THEN** the server SHALL silently drop the update via `processReadOnlySyncMessage`
- **AND** no error SHALL be sent to the client (silent drop allows continued reading)

## REMOVED Requirements

### Requirement: WebSocket write-access message
**Reason**: Replaced by HTTP-based `writable` field in `GET /api/maps/:id` response. The custom WebSocket message type 4 (`MESSAGE_WRITE_ACCESS`) was a non-standard extension that required hacking y-websocket internals on the client side.
**Migration**: Write-access is now determined from the HTTP response before the WebSocket connection. Server-side enforcement is unchanged.
