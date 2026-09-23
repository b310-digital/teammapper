Each section is one pull request and leaves `main` releasable. PR 1 adds storage and the endpoints while every frontend still writes data URLs. PR 2 adds the cleanup job, so unused images never pile up once uploads start. PR 3 switches the frontend to upload, render and export references. No feature flag is needed, because nothing user-visible changes until PR 3 ships complete.

## 1. PR 1: image storage and endpoints

- [ ] 1.1 Accept `image:<hash>` with 64 lowercase hex characters in `sanitizeImageSrc`, next to the raster data URL, and name both forms in the node image type and schema in `packages/shared`
- [ ] 1.2 Add `parseImageDataUrl` to `sanitization.ts`, returning `{ mime, bytes }` for a raster base64 data URL and `null` for anything else, including a reference, with the raster allowlist shared with `sanitizeImageSrc`
- [ ] 1.3 Add the valibot schemas and derived types for the upload request `{ dataUrl }` and the response `{ reference }` to `packages/shared`
- [ ] 1.4 Add the `MmpImage` and `MmpImageData` entities as the Schema section of design.md describes
- [ ] 1.5 Add the migration with the SQL from the Schema section, including the check constraints and `STORAGE EXTERNAL`, and a down migration that drops `mmp_image_data`, then `mmp_image`; move no data
- [ ] 1.6 Add the `ImageStore` interface with put, get, copy, delete and delete-all-of-map, and its database implementation on `mmp_image_data`, where put inserts with `ON CONFLICT DO NOTHING`
- [ ] 1.7 Add a helper that runs a callback in a transaction holding `pg_advisory_xact_lock(hashtextextended('mmp_image:' || mapId, 0))`
- [ ] 1.8 Add the image service: under the map's lock, hash the bytes with sha256, dedupe on `(mapId, hash)` and renew `lastUsedAt`, enforce the cap on `SUM("size")::bigint`, write the bytes, then insert the metadata row with `ON CONFLICT DO NOTHING`; map a foreign key violation to not found
- [ ] 1.9 Read `MAX_IMAGE_BYTES_PER_MAP` in `config.service.ts` with a default of 50 MB, and document it in the README and `docker-compose.yml`
- [ ] 1.10 Add `POST /api/maps/:id/images`: answer 404 for a map id that is not a uuid, 400 when `parseImageDataUrl` returns `null` or the input exceeds `MAX_IMAGE_SRC_LENGTH`, check the `secret` query parameter with `checkWriteAccess`, answer 404 for a missing map as `findOne` does, 413 above the cap, and the shared response type on success
- [ ] 1.11 Raise the JSON body limit for the upload route above `MAX_IMAGE_SRC_LENGTH`
- [ ] 1.12 Add `GET /api/maps/:id/images/:hash` with the stored `Content-Type`, `Cache-Control: public, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`; answer 404 for a map id that is not a uuid, a hash that fails `^[0-9a-f]{64}$`, and a hash the map does not hold
- [ ] 1.13 Copy the images through `ImageStore` in map duplication, under the target map's lock, and set `lastUsedAt` of each copy to the time of duplication
- [ ] 1.14 Delete the bytes through `ImageStore` on user map deletion and in `deleteOutdatedMaps`, and let the cascade delete the rows
- [ ] 1.15 Tests: reference format and hash; dedupe within one map and a separate copy per map; two concurrent uploads of the same image both succeed; a retry after bytes without metadata succeeds and resolves; two concurrent uploads near the cap leave the total at or below it; missing, wrong and valid secret; SVG, oversized and `image:<hash>` bodies rejected with 400; 413 at the cap and a re-upload at the cap succeeding; GET headers, 404 across maps, 404 for a malformed hash and a non-uuid map id; the migration's checks reject a bad hash and a non-raster MIME type; duplicate and delete keep and remove images; sanitization accepts references and rejects `image:../secret`; persist and hydration keep both forms unchanged

## 2. PR 2: cleanup of unused images

- [ ] 2.1 Add a public method on `YjsGateway` that reports whether a map has a connection, reading `mapConnections`
- [ ] 2.2 Add the daily job in `tasks.service.ts` that deletes, through `ImageStore` and under each map's lock, every image that no node row of its map references and whose `lastUsedAt` is older than 24 hours, when its map has no connection or its `lastUsedAt` is older than 7 days; delete the metadata row before the bytes
- [ ] 2.3 Tests: an unused image older than 24 hours is deleted; an unused image older than 7 days in an open map is deleted; a referenced image, a 3-day-old image of an open map, an image uploaded 1 hour ago and a renewed old image are kept; an upload that runs during the job's deletion of the same image leaves a reference that resolves

## 3. PR 3: upload, render and export references

- [ ] 3.1 Add an image URL resolver option to `packages/mmp`, export its type from the entry point, and render a data URL as is and a reference through the resolver; on a failed load, hide the image element and leave `node.image.src` unchanged, replacing the `onerror` in `setImage` in `handlers/draw.ts` that clears it
- [ ] 3.2 Add the `NodeImageSource` interface and a registration method on `MmpService` with an accessor that throws before registration, and pass mmp a resolver that delegates to it
- [ ] 3.3 Register a `NodeImageSource` from `MapSyncService` when it prepares a map: `resolve` maps `image:<hash>` to `api/maps/<uuid>/images/<hash>` and `upload` posts the shared request type with the `secret` query parameter, both reading the uuid from `getAttachedMap()` and the secret at call time
- [ ] 3.4 In `MmpService.addNodeImage`, read the selected node's id before the upload, set the returned reference on that node by id, skip a node deleted meanwhile, and on failure keep the previous image and show an error, with the message in every language file
- [ ] 3.5 Inline referenced images as data URLs in `convertImages` in `handlers/export.ts` for SVG, PNG, JPG and PDF, and drop an image whose fetch fails
- [ ] 3.6 Add an async JSON export for the download that inlines each distinct reference once and drops an image whose fetch fails; keep `exportAsJSON` synchronous with references for the map cache and the Mermaid export
- [ ] 3.7 Update the glossary entry **Image** for the two forms, and add **Image reference**
- [ ] 3.8 Unit tests: the resolver renders both forms in one map; a failed load keeps the reference in the node and in the Y.Doc after an image size change; a failed upload keeps the previous image; a selection change during the upload sets the image on the original node; every export contains data URLs and no `image:` reference, including one with a missing image
- [ ] 3.9 E2E: client A adds an image and client B sees it; undo of a node delete and of an image replacement restores the image; a JSON export and import round trip keeps the images
