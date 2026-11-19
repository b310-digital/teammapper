# yjs-ws-resource-protection Specification

## Purpose

Limits message size, concurrent connections and connection rate on the Yjs WebSocket server, globally and per IP.

## Requirements

### Requirement: Maximum message payload size

The WebSocketServer SHALL set its `maxPayload` to the map size limit (`YJS_MAP_MAX_BYTES`, default 5,242,880 bytes) plus 65,536 bytes of headroom. For a larger message, the `ws` library SHALL close the connection with code 1009 (Message Too Big). The gateway SHALL reject a message larger than the map size limit before it checks any message budget.

#### Scenario: Normal-sized message accepted

- **WHEN** a client sends a Yjs sync message under the map size limit
- **THEN** the gateway processes the message

#### Scenario: Limit follows the configured map size

- **WHEN** `YJS_MAP_MAX_BYTES` is 65,536
- **THEN** the `maxPayload` is 131,072 bytes

#### Scenario: Message above the map size limit rejected by name

- **WHEN** a client sends a message larger than the map size limit but within the headroom
- **THEN** the gateway closes that connection with code 4400 and the close reason `mapTooLarge`
- **AND** the other clients stay connected

#### Scenario: Oversized message rejected

- **WHEN** a client sends a message larger than the `maxPayload`
- **THEN** the `ws` library closes the connection with code 1009 (Message Too Big)
- **AND** the gateway logs the rejection with reason `mapTooLarge`
- **AND** the standard close cleanup path runs

### Requirement: Rejected change handling

The gateway SHALL close the sender of a rejected change with code 4400 and a close reason from the shared rejection vocabulary. A client that receives code 4400 or 1009 SHALL stop reconnecting, turn read-only and show a translated message.

When validation rejects a change, the gateway SHALL also discard the live map. The gateway SHALL close every other client of the map with code 4002 and the same reason, so those clients reconnect and show a message that explains the reset.

A sender over a message budget SHALL close with code 1008 and the reason `rateLimited`. That client SHALL reconnect.

#### Scenario: Sender of a rejected change stops

- **WHEN** validation rejects a client's change
- **THEN** the gateway closes that client with code 4400 and the rejection reason
- **AND** the client stays read-only without reconnecting

#### Scenario: Peers reset with a message

- **WHEN** validation rejects a client's change
- **THEN** the gateway closes every other client of the map with code 4002 and the rejection reason
- **AND** each peer reconnects to the last saved state and shows the reset message

#### Scenario: Rejection logged once per map and reason per minute

- **WHEN** the gateway rejects several changes on one map for the same reason within one minute
- **THEN** the gateway writes one WARN line with the map, reason, byte count, client count and action
- **AND** the first line after that minute states how many repeats the gateway suppressed

#### Scenario: Message budget exceeded

- **WHEN** a client exceeds its message budget
- **THEN** the gateway closes that connection with code 1008 and the reason `rateLimited`
- **AND** the gateway logs the rejection with action `retry`
- **AND** the client reconnects

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
