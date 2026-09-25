# Proposal

## Why

The browser holds a map's modification secret in the URL fragment and hands it to the server in three requests:

1. `GET /api/maps/:id?secret=` puts the secret into the query string.
2. The Yjs WebSocket URL `/yjs/<id>?secret=` puts it into the query string as well.
3. `POST /api/maps/:id/images` sends it as a bare `Authorization` header.

Reverse proxies, CDNs, load balancers and APM agents write the request line to their logs, so those logs store a secret from the query string in plain text. Anyone who reads those logs gains write access to the map.

`Authorization` belongs to the infrastructure in front of TeamMapper. Behind basic auth or an auth proxy, the browser fills that header with the basic auth credentials. The image upload then overwrites them, so either the proxy rejects the upload or the server reads the wrong value.

## What Changes

- HTTP requests carry the secret in `X-Map-Modification-Secret`:
  - `GET /api/maps/:id` reads it there and stops reading `?secret=`.
  - `POST /api/maps/:id/images` reads it there and stops reading `Authorization`.
- The Yjs WebSocket client offers two subprotocols, `teammapper.v1` and `teammapper.secret.<secret>`. A map without a secret offers `teammapper.v1` alone.
- The server reads the secret from the offered subprotocols and selects `teammapper.v1` only, so the handshake response carries no secret.
- For one release the server still reads `?secret=` on the WebSocket URL when no secret subprotocol arrives, so a tab that loaded the old frontend keeps its write access. A later release removes that fallback.
- `@teammapper/shared` exports the header name and the subprotocol strings, so the client and the server name them once.

## Capabilities

### Modified Capabilities

- `yjs-sync`: the WebSocket handshake reads the modification secret from a subprotocol, with the query parameter as a fallback.
- `yjs-write-access`: `GET /api/maps/:id` reads the modification secret from `X-Map-Modification-Secret`.

The pending change `store-node-images-by-reference` names `X-Map-Modification-Secret` for the image upload.

## Non-goals

- A fallback for the HTTP endpoints. A stale tab fails one image upload or loads the map read-only once, and a reload fixes it.
- The secret the owner receives in `GET /api/maps` and keeps in IndexedDB.
- Base64url encoding. TeamMapper generates each secret as a uuid, and a uuid is a valid subprotocol token.
- An authentication message after connect, as [Hocuspocus](https://github.com/ueberdosis/hocuspocus/blob/main/packages/provider/src/HocuspocusProvider.ts) sends it. Hocuspocus keeps the secret out of the handshake headers, but that approach needs a custom provider in place of `y-websocket`, whose `onopen` sends SyncStep1 and awareness before the app can write. It also needs the server to buffer frames from unauthenticated clients, as the Hocuspocus [`ClientConnection`](https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/ClientConnection.ts) does. Revisit if TeamMapper adopts Hocuspocus, or if a deployment must log every request header.

## Impact

- Backend: `MapWriteAccessGuard`, `MapsController.findOne`, `YjsGateway` (`handleProtocols` and the secret lookup), `yjsProtocol.ts`.
- Frontend: `HttpService.get` takes headers, and `MapSyncService` and `YjsSyncService` send the new transports.
- `packages/shared`: the header and subprotocol constants.
- A deployment that splits the frontend and the API across origins must allow `X-Map-Modification-Secret` in `Access-Control-Allow-Headers`.
