# Proposal

## Why

A node image travels as a base64 data URL of up to 200 KB, in `mmp_node.imageSrc` and in the Y.Doc. Each persist rewrites all image bytes of the map, each client downloads them all on sync, the WebSocket payload limit must fit them, and a pictogram on several nodes is stored once per node.

## What Changes

- A new table `mmp_image` records each image once per map, keyed by `(mapId, hash)`, where `hash` is the sha256 of the bytes, with `mime` (jpeg, png, webp or gif), `size` and `lastUsedAt`. A second table `mmp_image_data` holds the bytes. Both cascade on map delete.
- A node references a stored image as `image:<hash>`, with no map id, so a duplicated map keeps its references.
- Only a storage interface reads and writes the bytes, so object storage can later replace `mmp_image_data` alone.
- `POST /api/maps/:id/images` stores an image and returns its reference. It requires the modification secret and enforces a per-map storage cap.
- `GET /api/maps/:id/images/:hash` returns the bytes with `Cache-Control: immutable`.
- The frontend uploads every new image before setting it on a node, and renders a reference from the image endpoint.
- A daily job deletes images no node references, once the image went unused for 24 hours and no client has the map open, or once the image went unused for 7 days.
- Duplicating a map copies its images. Deleting a map deletes them.
- PNG, SVG, JPG, PDF and JSON exports keep images inline as data URLs.
- A TypeORM migration creates both tables and moves no data.

### Both forms stay valid

The server accepts data URLs alongside references and leaves them as they are. Existing maps, older cached frontends and JSON imports keep data URLs, and the frontend renders them. Only images added through a current frontend use the table.

## Capabilities

### New Capabilities

- `node-image-storage`: per-map image storage, its endpoints and cap, rendering both forms, cleanup, and copying and deleting images with their map.

### Modified Capabilities

- `input-sanitization`: a node image may be a raster data URL or an `image:<hash>` reference.
- `node-operations`: an uploaded image displays on the node through its reference.
- `yjs-sync`: the `image` field of a node in the Y.Doc holds a reference or a data URL.
- `yjs-persistence`: image bytes live in a table of their own, and persist writes node images as given.
- `import-export`: exports inline referenced images, and JSON import keeps data URLs.

## Non-goals

- Storing Yjs state in the database (#1389).
- Object storage.
- Converting existing data URLs and dropping data URL support (follow-up issue).

## Impact

- Backend: two entities and a migration, storage service, controller, cleanup in `tasks.service.ts`, `sanitization.ts`, map duplication, `MAX_IMAGE_BYTES_PER_MAP`.
- Frontend and `packages/mmp`: image upload in `MmpService.addNodeImage`, reference resolution when rendering, `convertImages` in `handlers/export.ts`.
- `packages/shared`: the node image type names both forms, and schemas type the upload request and response.
