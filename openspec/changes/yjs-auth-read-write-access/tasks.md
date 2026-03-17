## 1. Backend: Add `writable` to HTTP response

- [x] 1.1 Add `writable?: boolean` to `IMmpClientMap` interface in `teammapper-backend/src/map/types.ts`
- [x] 1.2 Import `Query` from `@nestjs/common` and `checkWriteAccess` from `../utils/yjsProtocol` in `maps.controller.ts`
- [x] 1.3 Add `@Query('secret') secret?: string` parameter to `findOne` endpoint
- [x] 1.4 Call `mapsService.findMap(mapId)` to get the map's `modificationSecret`, compute `writable` via `checkWriteAccess()`, and return `{ ...map, writable }`
- [x] 1.5 Write unit tests: no secret on unprotected map returns `writable: true`, correct secret returns `writable: true`, wrong/missing secret returns `writable: false`

## 2. Backend: Remove WebSocket write-access message

- [x] 2.1 Remove `this.send(ws, encodeWriteAccessMessage(writable))` from `setupSync()` in `yjs-gateway.service.ts`
- [x] 2.2 Remove `encodeWriteAccessMessage` import from `yjs-gateway.service.ts`
- [x] 2.3 Remove `MESSAGE_WRITE_ACCESS` constant and `encodeWriteAccessMessage()` function from `yjsProtocol.ts`
- [x] 2.4 Remove or update the write-access message ordering test in `yjs-gateway.service.spec.ts`

## 3. Frontend: Read `writable` from HTTP response

- [x] 3.1 Add `writable?: boolean` to `ServerMap` interface in `server-types.ts`
- [x] 3.2 Update `fetchMapFromServer` to append `?secret=<encoded_secret>` when `modificationSecret` is set
- [x] 3.3 Set `this.yjsWritable = serverMap.writable !== false` in `prepareExistingMap` after fetching
- [x] 3.4 Write unit tests: `fetchMapFromServer` appends secret param when set, omits when empty; `prepareExistingMap` sets `yjsWritable` correctly for `true`, `false`, and `undefined`

## 4. Frontend: Remove WebSocket write-access listener code

- [x] 4.1 Remove `setupYjsWriteAccessListener()` method from `map-sync.service.ts`
- [x] 4.2 Remove `attachWriteAccessListener()` method from `map-sync.service.ts`
- [x] 4.3 Remove `parseWriteAccessMessage()` method from `map-sync.service.ts`
- [x] 4.4 Remove `this.setupYjsWriteAccessListener()` call from `setupYjsConnection`
- [x] 4.5 Remove `const MESSAGE_WRITE_ACCESS = 4` constant from `map-sync.service.ts` (line 64)
- [x] 4.6 Remove `MESSAGE_WRITE_ACCESS` constant and `parseWriteAccessBytes()` function from `yjs-utils.ts`
- [x] 4.7 Remove or update tests for `parseWriteAccessBytes` and `parseWriteAccessMessage` in `map-sync.service.spec.ts`
