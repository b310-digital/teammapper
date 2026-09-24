# Design

## Context

See proposal.md for why images move out of the node. The database table is a step towards object storage, which a later change introduces. This design fixes only the boundaries that let that later change replace one component.

## Goals / Non-Goals

**Goals:**

- A later switch to object storage replaces the byte storage implementation and one table, and changes nothing else.
- Node references, the Y.Doc and the frontend stay untouched by that switch.

**Non-Goals:**

- Choosing an object store, or moving bytes into one.
- Encrypting image bytes at rest. The object storage change adds it inside its `ImageStore` implementation.
- Deduplicating an image uploaded twice to one map.

## Decisions

### An image is identified by a random uuid

The server generates a uuid per upload, and `(mapId, id)` keys the image. The same image on several nodes of one map is rare, so deduplication by content hash does not pay for the idempotent inserts, the renewal on re-upload and the lock against the cleanup job it would need.

### Only the storage interface touches image bytes

A backend interface, `ImageStore`, puts, gets, copies and deletes the bytes of one image, and deletes all images of one map. No other code reads or writes the bytes. Map deletion and the cleanup job call it explicitly, because a foreign key cascade cannot reach a store outside the database.

The server writes the bytes before the metadata row and deletes the metadata row before the bytes, so a crash never leaves a row whose bytes are missing.

No operation takes a lock. Concurrent uploads can together exceed the cap by the uploads in flight, each at most `UPLOAD_IMAGE_MAX_SIZE_BYTES`. A cleanup that races a duplication can leave the copy a row without bytes, but only for an image no node references, which the next run removes.

### Metadata and bytes live in separate tables

`mmp_image` holds `mapId`, `id`, `mimetype`, `size` and `createdAt`. The cap and the cleanup job read only this table. `mmp_image_data` holds the bytes, and only the database implementation of `ImageStore` touches it, so it behaves like the bucket that later replaces it.

Both tables key on `(mapId, id)` and cascade on map delete; the bytes live in the database, so the cascade removes them with the map. A check constraint limits `mimetype` to the raster allowlist, because the GET endpoint sends it as `Content-Type`. `mmp_image_data` has no foreign key to `mmp_image`, since the bytes are written first. The migration moves no data.

### References and URLs name no store

A node holds `image:<uuid>`, and the frontend resolves it to `/api/maps/:id/images/:imageId`. Neither names the store or the server, so the switch migrates no node, and the endpoint can later proxy or redirect to the store. Duplicating a map copies its images under the same ids, so no node needs rewriting.

Alternatives considered: an absolute URL in the node, which breaks when the domain changes, and a global image id, which forces duplication to rewrite every node.

### The frontend resolves and uploads through MapSyncService

`packages/mmp` takes an image URL resolver as a map option and names no API path. `MapSyncService`, which holds the map uuid and the secret, registers the resolver and the upload function on `MmpService`.

A failed image load hides the image and leaves `node.image.src` unchanged. Today `setImage` clears it, which with references would erase the image in the Y.Doc for every client on any network error.

`addNodeImage` sets the returned reference on the node that was selected when the upload started.

Image drop today bypasses `addNodeImage` and the toolbar's resize. It goes through both, and accepts files only: dropped markup yields a remote URL, which the upload cannot take and the server already discards. Pictograms skip the resize, which would turn their transparent background black.

### Upload endpoint

`POST /api/maps/:id/images` takes one multipart file in the field `file`, with the modification secret in the `Authorization` header, which keeps it out of access logs. The rate limit, the map lookup and the secret run as guards, so no body is read before they pass. `FileInterceptor` on memory storage enforces `UPLOAD_IMAGE_MAX_SIZE_BYTES` (413), and `ParseFilePipe` with `FileTypeValidator` checks that the magic bytes and the declared type are both raster types (422); the magic bytes matter because the client chooses the declared type freely. The server stores the declared type. `ParseFilePipe` answers one status for all its checks, so a missing file answers 422 as well.

`UPLOAD_IMAGE_MAX_SIZE_BYTES` defaults to 150000, the decoded size of the largest data URL the frontend produces.

The frontend shows a dedicated message for 413, which in practice means the cap, since the resize keeps files below the size limit, and a generic one for every other failure.

### Rate limit

`@nestjs/throttler` with its default in-memory storage limits uploads per client IP, 30 per 60 s by default. Express `trust proxy` follows the existing `WS_TRUST_PROXY`, so HTTP and WebSocket agree on the client IP.

Status codes:

| Status | Upload | Read |
|---|---|---|
| 200 | | Image returned |
| 201 | Image stored, body `{ reference }` | |
| 403 | Missing or wrong secret | |
| 404 | Map missing or id not a uuid | Image not held by the map, or an id not a uuid |
| 413 | File above `UPLOAD_IMAGE_MAX_SIZE_BYTES`, or upload above the map's cap | |
| 422 | Missing file, or content or declared type not raster | |
| 429 | Rate limit exceeded | |

### Read endpoint

`GET /api/maps/:id/images/:imageId` needs no secret, so view-only users see images. It sends the stored type, `Content-Length`, `Content-Disposition: inline` with a generic file name, `Cache-Control: immutable` and `nosniff`.

### Exports inline images; imports keep them as given

Every export replaces references with data URLs, so an exported file works without the server, and drops an image it cannot fetch. `exportAsJSON` stays synchronous with references for the map cache and the Mermaid export; the download uses a new async path.

A JSON import keeps any image `sanitizeImageSrc` accepts. A reference only appears in a hand-edited file and then shows no image.

### Cleanup instead of a delete endpoint

A daily job deletes images that no node row references and that were uploaded more than 7 days ago. There is no endpoint that deletes a single image, so undo can restore a removed image for 7 days after its upload.

Alternative considered: deleting an image when a client removes it from a node. The image would then be gone before the user can undo.

## Risks / Trade-offs

- [The same image uploaded twice is stored twice] → Rare, and bounded by the cap.
- [The cap is approximate] → Exceeded at most by the uploads in flight.
- [Users behind one NAT share the rate limit] → Both values are configurable.
- [Removed images free their space up to 7 days after upload] → The 413 message says so.
- [A later redirect to another origin taints the export canvas] → The later change proxies through the same origin or sets CORS headers.

## Migration Plan

1. A migration creates both tables and moves no data.
2. Deploy the backend before or with the frontend. An older cached frontend keeps writing data URLs, which the server accepts.
3. Rollback: revert and run the down migration. Nodes with references then lose their images, so export affected maps as JSON first.
