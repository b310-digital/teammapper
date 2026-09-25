## MODIFIED Requirements

### Requirement: Authentication at WebSocket handshake
The server SHALL verify the modification secret during the WebSocket handshake. The client SHALL send the `mapId` in the path or as a query parameter. The client SHALL offer the secret as the subprotocol `teammapper.secret.<secret>` next to `teammapper.v1`. The server SHALL select `teammapper.v1` and SHALL NOT select the secret subprotocol, so the handshake response carries no secret. When no secret subprotocol arrives, the server SHALL read the `secret` query parameter as a fallback for one release. Clients with a valid secret SHALL receive read-write access. Clients without a valid secret SHALL receive read-only access, unless the map has no modification secret, which grants read-write access.

#### Scenario: Client offers a valid secret subprotocol
- **WHEN** a client connects offering `teammapper.v1, teammapper.secret.<valid-secret>`
- **THEN** the server SHALL select the subprotocol `teammapper.v1`
- **AND** the server SHALL allow the client to send Y.Doc updates (read-write access)

#### Scenario: Client offers an invalid secret subprotocol
- **WHEN** a client connects offering `teammapper.v1, teammapper.secret.<invalid-secret>`
- **THEN** the server SHALL allow the client to receive Y.Doc state but SHALL silently drop any write messages from the client

#### Scenario: Secret subprotocol and query parameter both arrive
- **WHEN** a client offers a secret subprotocol and also sends `?secret=`
- **THEN** the server SHALL decide write access from the subprotocol

#### Scenario: Client from an older frontend sends the query parameter
- **WHEN** a client connects with `?secret=<valid-secret>` and offers no subprotocol
- **THEN** the server SHALL complete the handshake without a subprotocol
- **AND** the server SHALL grant read-write access

#### Scenario: Client connects to a map with no modification secret
- **WHEN** a client connects to a map that has no modification secret set
- **THEN** the server SHALL grant read-write access regardless of the provided secret

### Requirement: Frontend WebSocket provider
The frontend SHALL connect to the Yjs WebSocket endpoint using `y-websocket`'s `WebsocketProvider`. The provider SHALL be configured with reconnection support. The provider SHALL pass the modification secret through its `protocols` option and SHALL NOT put it into the URL.

#### Scenario: Frontend establishes Yjs connection
- **WHEN** a user navigates to a map with a modification secret
- **THEN** the frontend SHALL create a `WebsocketProvider` targeting `/yjs` with the map's UUID as the room name
- **AND** the provider SHALL offer the subprotocols `teammapper.v1` and `teammapper.secret.<secret>`
- **AND** the WebSocket URL SHALL NOT contain the secret

#### Scenario: Frontend connects to a map without a secret
- **WHEN** the frontend holds no modification secret for the map
- **THEN** the provider SHALL offer the subprotocol `teammapper.v1` alone

#### Scenario: WebSocket connection lost
- **WHEN** the WebSocket connection is interrupted
- **THEN** the `WebsocketProvider` SHALL automatically attempt reconnection with backoff

#### Scenario: WebSocket reconnects successfully
- **WHEN** the `WebsocketProvider` reconnects after a disconnection
- **THEN** the provider SHALL offer the same subprotocols again
- **AND** the Yjs sync protocol SHALL automatically reconcile the local Y.Doc with the server Y.Doc without a full map reload
