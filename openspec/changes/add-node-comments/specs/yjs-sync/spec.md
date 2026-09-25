## ADDED Requirements

### Requirement: Y.Doc holds the comments of the map

Each Y.Doc SHALL contain a `Y.Map("comments")` next to `nodes` and `mapOptions`. Its keys SHALL be comment ids and its values plain objects with the fields of `MapComment` (id, nodeId, text, createdAt, updatedAt), where the times are milliseconds since the epoch. An edit SHALL replace the whole value. A comment MAY name a node that is not in the `nodes` map. Clients SHALL write comments with the transaction origin `'comment'`.

#### Scenario: Comment added to Y.Doc

- **WHEN** a client adds a comment to node A
- **THEN** the `comments` map SHALL hold one entry under the new comment id with `nodeId` set to the id of A
- **AND** the transaction origin SHALL be `'comment'`

#### Scenario: Comment observed on a peer

- **WHEN** a remote transaction adds, replaces or deletes an entry of the `comments` map
- **THEN** the client SHALL update its comment panel and comment badges
- **AND** it SHALL leave the rendered nodes unchanged

### Requirement: Server refuses a client holding a doc of an earlier generation

Each time the server builds a Y.Doc from the database, it SHALL create a new random generation id, keep it with the doc and write it to the `meta` map under `generation`. After its first sync, the client SHALL read the generation and add it as the `generation` parameter of every later connection of the same provider. When a connection carries a `generation` that differs from the one the server keeps for the doc, the server SHALL close it with code 4009 before it sends or accepts any sync message. A connection without the parameter SHALL be accepted. On close code 4009 the client SHALL reload the page, as it does when the map was deleted. The server SHALL compare against the id it keeps, never against the `meta` entry. This guard is interim: once the Yjs state itself is stored (#1389), a rebuilt doc keeps its identity and the guard is no longer needed.

#### Scenario: Reconnect after eviction

- **GIVEN** a client holds the doc of generation G1 and loses its connection
- **AND** the server evicts the doc and later builds it again from the database as generation G2
- **WHEN** the client reconnects with `generation` G1
- **THEN** the server SHALL close the connection with code 4009 before any sync message
- **AND** the server doc SHALL contain nothing from the client's doc
- **AND** the client SHALL reload the page and load generation G2

#### Scenario: Reconnect within the same generation

- **GIVEN** a client holds the doc of generation G1
- **WHEN** it reconnects while the server still holds G1
- **THEN** the server SHALL accept the connection and sync as usual

#### Scenario: Server restart

- **GIVEN** clients hold docs of generation G1
- **WHEN** the server restarts and a client reconnects with G1
- **THEN** the server SHALL build a new generation and refuse the client with code 4009

#### Scenario: First connection

- **WHEN** a client connects without a `generation` parameter
- **THEN** the server SHALL accept the connection
