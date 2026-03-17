## ADDED Requirements

### Requirement: Y.Doc per map on the server
The server SHALL maintain one Y.Doc instance per active map. A Y.Doc is created or loaded when the first client connects to a map and SHALL remain in memory while at least one client is connected. The Y.Doc SHALL be evicted from memory after a grace period (default 30 seconds) following the last client disconnect.

#### Scenario: First client connects to a map with no active Y.Doc
- **WHEN** a client opens a WebSocket connection for a map that has no Y.Doc in memory
- **THEN** the server SHALL load the map's nodes from PostgreSQL, hydrate a new Y.Doc with the node data, and use it for the connection

#### Scenario: Client connects to a map with an active Y.Doc
- **WHEN** a client opens a WebSocket connection for a map that already has a Y.Doc in memory
- **THEN** the server SHALL use the existing Y.Doc and sync its current state to the new client

#### Scenario: Last client disconnects
- **WHEN** the last client disconnects from a map's WebSocket
- **THEN** the server SHALL persist the Y.Doc to the database, then evict it from memory after the grace period

#### Scenario: Client reconnects within grace period
- **WHEN** a client connects to a map whose Y.Doc is still in the grace period after last disconnect
- **THEN** the server SHALL reuse the in-memory Y.Doc without reloading from the database

### Requirement: WebSocket server on dedicated path
The server SHALL expose a WebSocket endpoint at the `/yjs` path, mounted on the NestJS HTTP server using the `ws` library. This endpoint SHALL handle the Yjs sync protocol via `y-websocket`'s `setupWSConnection` utility.

#### Scenario: Client connects to the Yjs WebSocket endpoint
- **WHEN** a client opens a WebSocket connection to `/yjs?mapId=<uuid>`
- **THEN** the server SHALL establish a Yjs sync connection for the specified map's Y.Doc

#### Scenario: Client connects to an invalid map ID
- **WHEN** a client opens a WebSocket connection with a `mapId` that does not exist in the database
- **THEN** the server SHALL close the WebSocket connection with an appropriate error code

### Requirement: Y.Doc structure mirrors node model
Each Y.Doc SHALL contain a `Y.Map("nodes")` where keys are node IDs and values are `Y.Map` instances with the same fields as `ExportNodeProperties` (id, parent, name, isRoot, locked, detached, k, coordinates, colors, font, image, link). A separate `Y.Map("mapOptions")` SHALL hold map-level metadata.

#### Scenario: Y.Doc hydrated from database
- **WHEN** a Y.Doc is created from database rows
- **THEN** each MmpNode row SHALL be converted to a Y.Map entry in the `nodes` map with all `ExportNodeProperties` fields populated

#### Scenario: Node added to Y.Doc
- **WHEN** a client adds a new entry to the `nodes` Y.Map
- **THEN** the entry SHALL be a Y.Map containing all required `ExportNodeProperties` fields

### Requirement: Authentication at WebSocket handshake
The server SHALL verify the modification secret during the WebSocket handshake. The `mapId` and `secret` SHALL be passed as query parameters. Clients with a valid secret SHALL receive read-write access. Clients without a valid secret (or maps with no secret set) SHALL receive read-only access by default, or read-write access if the map has no modification secret.

#### Scenario: Client connects with valid modification secret
- **WHEN** a client connects with `?mapId=<uuid>&secret=<valid-secret>`
- **THEN** the server SHALL allow the client to send Y.Doc updates (read-write access)

#### Scenario: Client connects with invalid modification secret
- **WHEN** a client connects with `?mapId=<uuid>&secret=<invalid-secret>`
- **THEN** the server SHALL allow the client to receive Y.Doc state but SHALL silently drop any write messages from the client

#### Scenario: Client connects to a map with no modification secret
- **WHEN** a client connects to a map that has no modification secret set
- **THEN** the server SHALL grant read-write access regardless of the provided secret

### Requirement: Frontend WebSocket provider
The frontend SHALL connect to the Yjs WebSocket endpoint using `y-websocket`'s `WebsocketProvider`. The provider SHALL be configured with reconnection support. The provider SHALL pass the map ID and modification secret as query parameters.

#### Scenario: Frontend establishes Yjs connection
- **WHEN** a user navigates to a map
- **THEN** the frontend SHALL create a `WebsocketProvider` targeting `/yjs` with the map's UUID as the room name and the modification secret as a query parameter

#### Scenario: WebSocket connection lost
- **WHEN** the WebSocket connection is interrupted
- **THEN** the `WebsocketProvider` SHALL automatically attempt reconnection with backoff

#### Scenario: WebSocket reconnects successfully
- **WHEN** the `WebsocketProvider` reconnects after a disconnection
- **THEN** the Yjs sync protocol SHALL automatically reconcile the local Y.Doc with the server Y.Doc without a full map reload

### Requirement: Connection status observable
The frontend SHALL expose a reactive `ConnectionStatus` observable (`'connected' | 'disconnected' | null`) via `MapSyncService`. UI components SHALL subscribe to this observable to present connection state (e.g., showing a disconnect dialog). The service SHALL NOT directly control UI elements like toasts or dialogs.

#### Scenario: Initial sync completes
- **WHEN** the `WebsocketProvider` fires its first `sync` event with `synced: true`
- **THEN** the connection status SHALL transition to `'connected'`
- **AND** edit mode and Y.Doc observers SHALL be initialized

#### Scenario: WebSocket disconnects
- **WHEN** the WebSocket connection is lost
- **THEN** the connection status SHALL transition to `'disconnected'`

#### Scenario: Connection reset during cleanup
- **WHEN** the Yjs connection is reset (e.g., navigating away or switching maps)
- **THEN** the connection status SHALL be reset to `null` as part of `resetYjs()` cleanup

### Requirement: Socket.io removal
The server SHALL NOT use Socket.io for any data synchronization or presence operations. The `@nestjs/platform-socket.io`, `socket.io`, and `socket.io-client` dependencies SHALL be removed. The frontend SHALL NOT import or use `socket.io-client`.

Note: During the phased rollout, both Socket.io and Yjs code paths coexist behind feature flags (`YJS_ENABLED` backend, `featureFlagYjs` frontend). This requirement is fully satisfied after the cleanup phase (task 13) removes all Socket.io code and feature flag branching.

#### Scenario: No Socket.io listeners on the server
- **WHEN** the server is running after the cleanup phase is complete
- **THEN** there SHALL be no Socket.io gateway or `@SubscribeMessage` handlers registered

#### Scenario: No Socket.io client on the frontend
- **WHEN** the frontend application is built after the cleanup phase is complete
- **THEN** the `socket.io-client` package SHALL NOT be included in the bundle
