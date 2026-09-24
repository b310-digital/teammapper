## Context

The browser reads a map's modification secret from the URL fragment. Before this change, the client sent the secret to the server three ways:

1. `GET /api/maps/:id?secret=` put the secret in the query string.
2. The Yjs WebSocket URL `/yjs/<id>?secret=` put it in the query string too.
3. `POST /api/maps/:id/images` sent it as the whole `Authorization` header.

`MapSyncService` builds both HTTP requests through `HttpService`. `YjsSyncService` opens the WebSocket through `y-websocket`'s `WebsocketProvider`, and `YjsGateway` upgrades it with `ws` in `noServer` mode.

## Decisions

### 1. One custom header for HTTP

**Decision:** Both HTTP endpoints read the secret from `X-Map-Modification-Secret`. The client sends the header only when it holds a secret. `MapSyncService.secretHeaders()` builds it for the map fetch and the image upload, and `HttpService.get` gained a `headers` argument to carry it. `postForm` already had one.

On the server, `MapsController.findOne` reads the header with `@Headers(MODIFICATION_SECRET_HEADER)`. `MapWriteAccessGuard` reads `request.headers[MODIFICATION_SECRET_HEADER]` and treats a value other than a string as no secret.

**Rationale:** Proxies log the request line, and most of them skip custom headers. A header with its own name leaves `Authorization` to basic auth or an auth proxy in front of TeamMapper.

**Alternative considered:** `Authorization: Bearer <secret>`. Rejected because it collides with the basic auth deployments this change fixes.

### 2. A subprotocol for the WebSocket

**Decision:** The browser `WebSocket` constructor sends no custom header, so `buildYjsProtocols(secret)` puts the secret in the one header the constructor controls, `Sec-WebSocket-Protocol`. The client offers `teammapper.v1` and `teammapper.secret.<secret>`. `YjsGateway` passes `selectSubprotocol` as `handleProtocols`, which picks `teammapper.v1` and never the secret entry, so the `101` response carries no secret. `parseSecretSubprotocol` reads the secret from the offer.

**Rationale:** The approach reuses `WebsocketProvider`'s `protocols` option and needs no change to the Yjs message flow.

**Alternative considered:** An auth message after connect, as Hocuspocus does it. The proposal's non-goals explain why TeamMapper skips it.

### 3. Query fallback on the WebSocket for one release

**Decision:** When the offer holds no secret subprotocol, the gateway reads `?secret=` from `parseQueryParams`. The subprotocol wins when a client sends both. The HTTP endpoints get no fallback.

**Rationale:** An open tab keeps the old frontend until you reload it. On the WebSocket, losing the secret would drop your edits without an error. On HTTP, a stale tab fails one upload or loads the map read-only once, and a reload fixes both. Task 5.1 tracks the removal.

### 4. Names in `@teammapper/shared`

**Decision:** `packages/shared/src/constants` exports `MODIFICATION_SECRET_HEADER`, `YJS_SUBPROTOCOL` and `YJS_SECRET_SUBPROTOCOL_PREFIX`, so the client and the server import the same strings. The header constant is lowercase because Node lowercases incoming header names, which lets the guard index `request.headers` with it.

## Risks / Trade-offs

**[Proxies that log every header]** A proxy that writes `Sec-WebSocket-Protocol` or `X-Map-Modification-Secret` to its logs still records the secret. Mitigation: the default logs of the common reverse proxies skip both headers. An auth message after connect remains the path if a deployment needs more.

**[Cross-origin deployments]** The header triggers a CORS preflight when the frontend and the API run on different origins. Mitigation: the proposal's impact section tells operators to allow `X-Map-Modification-Secret`.

**[Browsers reject a missing subprotocol]** A browser that offers subprotocols fails the connection when the server selects none. `selectSubprotocol` selects `teammapper.v1` whenever the client offers it, and old clients offer nothing, so neither case triggers the rejection.
