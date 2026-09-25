# Proposal

## Why

A node image travels as a base64 data URL of up to 200 KB, in `mmp_node.imageSrc` and in the Y.Doc. Each persist rewrites all image bytes of the map, each client downloads them all on sync, the WebSocket payload limit must fit them, and the same image on several nodes is stored once per node.

## What Changes

- Each upload is stored as its own image in two new tables, metadata in `mmp_image` and bytes in `mmp_image_data`, keyed by map and a server-generated uuid.
- A node references it as `image:<uuid>`. Only a storage interface touches the bytes, so object storage can later replace `mmp_image_data` alone.
- `POST /api/maps/:id/images` takes a multipart file and returns the reference. It requires the modification secret, is rate limited per IP, and enforces a per-map cap. `GET /api/maps/:id/images/:imageId` serves the image.
- The frontend uploads every new image before setting it on a node, and renders references from the image endpoint.
- A daily job deletes unreferenced images older than 7 days. Duplicating a map copies its images, deleting a map deletes them.
- Exports keep images inline as data URLs.

### Both forms stay valid

The server accepts data URLs alongside references and leaves them as they are. Existing maps, older cached frontends and JSON imports keep data URLs, and the frontend renders them. Only images added through a current frontend use the table.

## Capabilities

### New Capabilities

- `node-image-storage`: per-map image storage, its endpoints and cap, rendering both forms, cleanup, and copying and deleting images with their map.

### Modified Capabilities

- `input-sanitization`: a node image may be a raster data URL or an `image:<uuid>` reference.
- `node-operations`: an uploaded image displays on the node through its reference.
- `yjs-sync`: the `image` field of a node in the Y.Doc holds a reference or a data URL.
- `yjs-persistence`: image bytes live in a table of their own, and persist writes node images as given.
- `import-export`: exports inline referenced images, and JSON import keeps data URLs.

## Non-goals

- Storing Yjs state in the database (#1389).
- Object storage.
- Encrypting image bytes at rest. The object storage change adds it.
- Deduplicating an image uploaded twice to one map.
- Converting existing data URLs and dropping data URL support (follow-up issue).

## Impact

- Backend: entities and migration, storage interface, image controller and service, cleanup in `tasks.service.ts`, map duplication and deletion, `@nestjs/throttler`, four new settings.
- Frontend and `packages/mmp`: upload in `addNodeImage`, image drop, reference rendering, exports.
- `packages/shared`: the node image type names both forms; a schema types the upload response.
