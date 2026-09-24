# Tasks

## 1. Shared

- [x] 1.1 Export `MODIFICATION_SECRET_HEADER`, `YJS_SUBPROTOCOL` and `YJS_SECRET_SUBPROTOCOL_PREFIX` from `@teammapper/shared`

## 2. HTTP

- [x] 2.1 `MapWriteAccessGuard` reads `X-Map-Modification-Secret` and ignores `Authorization`
- [x] 2.2 `MapsController.findOne` reads `X-Map-Modification-Secret` and no query parameter
- [x] 2.3 `HttpService.get` takes headers, and `MapSyncService` sends the secret header on the map fetch and the image upload
- [x] 2.4 Specs: `images.controller.spec.ts` (including a basic auth `Authorization` next to the secret header) and `map-sync.service.spec.ts`

## 3. WebSocket

- [x] 3.1 `selectSubprotocol` and `parseSecretSubprotocol` in `yjsProtocol.ts`, with specs
- [x] 3.2 `YjsGateway` passes `handleProtocols` and reads the secret subprotocol before the query parameter
- [x] 3.3 Gateway specs: write access from the subprotocol, the subprotocol winning over the query, and a real handshake that selects `teammapper.v1`
- [x] 3.4 `YjsSyncService` offers `buildYjsProtocols(secret)` and no `params.secret`, with specs

## 4. End to end

- [x] 4.1 `e2e/modification-secret.spec.ts`: a second client edits and uploads an image, the upload carries the header and no `Authorization`, and no request or WebSocket URL contains the secret

## 5. Follow-up

- [ ] 5.1 Next release: drop the `secret` query parameter from `parseQueryParams` and the gateway fallback
