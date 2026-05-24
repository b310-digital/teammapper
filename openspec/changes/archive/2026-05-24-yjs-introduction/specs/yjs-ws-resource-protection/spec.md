## ADDED Requirements

### Requirement: Maximum message payload size

The WebSocketServer SHALL be configured with a `maxPayload` of 1,048,576 bytes (1 MiB). Messages exceeding this limit SHALL cause the connection to be closed automatically by the `ws` library with close code 1009 (Message Too Big).

#### Scenario: Normal-sized message accepted

- **WHEN** a client sends a Yjs sync message under 1 MiB
- **THEN** the message is processed normally

#### Scenario: Oversized message rejected

- **WHEN** a client sends a message exceeding 1 MiB
- **THEN** the `ws` library closes the connection with code 1009 (Message Too Big) and the standard close cleanup path executes

### Requirement: Global concurrent connection limit

The gateway SHALL enforce a maximum number of concurrent WebSocket connections globally. The default limit SHALL be 500 connections. When the limit is reached, new upgrade requests SHALL be rejected with HTTP status 503 (Service Unavailable).

#### Scenario: Connection accepted below global limit

- **WHEN** a new WebSocket upgrade request arrives and the total connection count is below 500
- **THEN** the upgrade proceeds normally

#### Scenario: Connection rejected at global limit

- **WHEN** a new WebSocket upgrade request arrives and the total connection count has reached 500
- **THEN** the upgrade is rejected with HTTP status 503 and the socket is destroyed

#### Scenario: Global count decremented on disconnect

- **WHEN** a WebSocket connection closes (normal or error)
- **THEN** the global connection count is decremented, allowing new connections

### Requirement: Per-IP concurrent connection limit

The gateway SHALL enforce a maximum number of concurrent WebSocket connections per source IP address. The default limit SHALL be 50 connections per IP. When the limit is reached for a given IP, new upgrade requests from that IP SHALL be rejected with HTTP status 429 (Too Many Requests).

#### Scenario: Connection accepted below per-IP limit

- **WHEN** a new upgrade request arrives from an IP with fewer than 50 active connections
- **THEN** the upgrade proceeds normally

#### Scenario: Connection rejected at per-IP limit

- **WHEN** a new upgrade request arrives from an IP that already has 50 active connections
- **THEN** the upgrade is rejected with HTTP status 429 and the socket is destroyed

#### Scenario: Per-IP count cleaned up when all connections close

- **WHEN** all connections from a specific IP address close
- **THEN** the per-IP tracking entry for that IP is removed to prevent memory growth

### Requirement: Per-IP connection rate limit

The gateway SHALL enforce a rate limit on new WebSocket connections per source IP address. The limit SHALL be 10 connections per 10-second sliding window. Upgrade requests exceeding the rate limit SHALL be rejected with HTTP status 429 (Too Many Requests).

#### Scenario: Connections within rate limit accepted

- **WHEN** a client opens connections at a rate below 10 per 10 seconds
- **THEN** all upgrade requests proceed normally

#### Scenario: Rapid reconnect loop rejected

- **WHEN** a client from a single IP opens more than 10 connections within a 10-second window
- **THEN** subsequent upgrade requests are rejected with HTTP status 429 until the window expires

#### Scenario: Rate limit window expires

- **WHEN** the 10-second window elapses after rate-limited connections
- **THEN** new connections from that IP are accepted again
