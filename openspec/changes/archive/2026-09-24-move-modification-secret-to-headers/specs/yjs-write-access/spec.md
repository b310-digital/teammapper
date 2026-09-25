## MODIFIED Requirements

### Requirement: HTTP-based write-access determination
The `GET /api/maps/:id` endpoint SHALL read an optional modification secret from the `X-Map-Modification-Secret` header and SHALL NOT read a `secret` query parameter. The server SHALL compare the secret against the map's `modificationSecret` using the existing `checkWriteAccess()` utility and return a `writable` boolean field in the response.

#### Scenario: Map with no modification secret
- **WHEN** a client requests `GET /api/maps/:id` for a map that has no `modificationSecret`
- **THEN** the response SHALL include `writable: true` whether or not the client sends the header

#### Scenario: Map with correct secret
- **WHEN** a client requests `GET /api/maps/:id` with `X-Map-Modification-Secret: <correct_secret>`
- **AND** the map has a `modificationSecret` that matches the provided secret
- **THEN** the response SHALL include `writable: true`

#### Scenario: Map with wrong or missing secret
- **WHEN** a client requests `GET /api/maps/:id` without the header (or with an incorrect secret)
- **AND** the map has a `modificationSecret`
- **THEN** the response SHALL include `writable: false`

#### Scenario: Secret in the query string
- **WHEN** a client requests `GET /api/maps/:id?secret=<correct_secret>` without the header
- **AND** the map has a `modificationSecret`
- **THEN** the response SHALL include `writable: false`

### Requirement: Frontend reads write-access from HTTP response
When the frontend fetches a map via `fetchMapFromServer`, it SHALL send the stored `modificationSecret` in the `X-Map-Modification-Secret` header and SHALL NOT put it into the URL. The `prepareExistingMap` method SHALL set `yjsWritable` from the response's `writable` field before the WebSocket connection is established.

#### Scenario: Secret passed in HTTP request
- **WHEN** `modificationSecret` is set in `MapSyncService`
- **AND** `fetchMapFromServer` is called
- **THEN** the HTTP request SHALL carry `X-Map-Modification-Secret: <secret>`
- **AND** the request URL SHALL NOT contain the secret

#### Scenario: No secret omits the header
- **WHEN** `modificationSecret` is empty or null
- **AND** `fetchMapFromServer` is called
- **THEN** the HTTP request SHALL NOT carry `X-Map-Modification-Secret`

#### Scenario: writable set from HTTP response
- **WHEN** `prepareExistingMap` receives the server response
- **THEN** `yjsWritable` SHALL be set to `serverMap.writable !== false`
- **AND** `yjsWritable` SHALL be set BEFORE the WebSocket connection is established

#### Scenario: writable defaults to true when absent
- **WHEN** the server response does not include a `writable` field
- **THEN** `yjsWritable` SHALL default to `true`
- **AND** server-side enforcement SHALL still apply (client writes silently dropped if unauthorized)
