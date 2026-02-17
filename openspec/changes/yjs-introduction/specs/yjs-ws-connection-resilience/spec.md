## ADDED Requirements

### Requirement: WebSocket error handler on individual connections

The gateway SHALL register a `ws.on('error')` handler on every WebSocket connection during setup. The handler SHALL log the error with connection context (mapId) and call `ws.terminate()` to force-close the connection. The existing `close` event handler SHALL execute its cleanup path after termination.

#### Scenario: Connection emits an error event

- **WHEN** a WebSocket connection emits an `error` event (e.g., ECONNRESET, write error)
- **THEN** the error is logged with the associated mapId and the connection is terminated via `ws.terminate()`

#### Scenario: Error handler does not crash the process

- **WHEN** a WebSocket connection emits an `error` event
- **THEN** the error does not propagate as an uncaught exception and the server process continues running

#### Scenario: Cleanup runs after error-triggered termination

- **WHEN** a connection is terminated due to an error
- **THEN** the `close` handler fires, removing the connection from tracking, cleaning up awareness state, and decrementing the client count

### Requirement: Ping/pong heartbeat for zombie connection detection

The gateway SHALL implement a periodic ping/pong heartbeat mechanism using the WebSocket protocol's native ping/pong frames. The heartbeat interval SHALL be 30 seconds. Connections that fail to respond with a pong before the next ping cycle SHALL be terminated.

#### Scenario: Healthy connection responds to ping

- **WHEN** the server sends a ping frame to a connected client
- **THEN** the client responds with a pong frame and the connection remains open through the next heartbeat cycle

#### Scenario: Zombie connection detected and terminated

- **WHEN** a connection does not respond with a pong before the next 30-second ping cycle
- **THEN** the server terminates the connection via `ws.terminate()` and the standard close cleanup path executes

#### Scenario: New connection marked as alive

- **WHEN** a new WebSocket connection is established
- **THEN** the connection is marked as alive so it is not terminated on the first heartbeat cycle

#### Scenario: Heartbeat interval cleaned up on shutdown

- **WHEN** the server module is destroyed
- **THEN** the heartbeat interval is cleared and no further pings are sent

### Requirement: Connection setup timeout

The gateway SHALL enforce a timeout on the async connection setup phase (database lookups and document hydration). The timeout SHALL be 10 seconds. If setup does not complete within the timeout, the WebSocket SHALL be closed with code 1013 (Try Again Later).

#### Scenario: Setup completes within timeout

- **WHEN** `findMap` and `getOrCreateDoc` complete within 10 seconds
- **THEN** the connection is established normally and the timeout timer is canceled

#### Scenario: Setup exceeds timeout

- **WHEN** the database operations in `handleConnection` take longer than 10 seconds
- **THEN** the WebSocket is closed with close code 1013 and the timeout timer is cleaned up

#### Scenario: Timeout timer does not leak

- **WHEN** the connection setup completes (success or failure) before the timeout
- **THEN** the timeout timer is canceled to prevent resource leaks
