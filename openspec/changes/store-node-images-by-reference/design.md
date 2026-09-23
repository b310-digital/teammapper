# Design

## Context

See proposal.md for why images move out of the node. The database table is a step towards object storage, which a later change introduces. This design fixes only the boundaries that let that later change replace one component. It does not design the object store.

Today `mmp_node.imageSrc` holds a data URL, and `sanitizeImageSrc` in `teammapper-backend/src/map/utils/sanitization.ts` accepts only that form. The midnight job in `tasks.service.ts` deletes outdated maps through `MapsService.deleteOutdatedMaps`.

## Goals / Non-Goals

**Goals:**

- A later switch to object storage replaces the byte storage implementation and one table, and changes nothing else.
- Node references, the Y.Doc and the frontend stay untouched by that switch.

**Non-Goals:**

- Choosing an object store, its key layout, or how the server serves its objects.
- Moving bytes from the database to an object store.

## Decisions

### Only the storage interface touches image bytes

A backend interface, `ImageStore`, offers put, get, copy and delete for the bytes of one image in one map, and delete for all images of one map. Upload, download, map duplication, map deletion and the cleanup job call it. No other code reads or writes the bytes.

Map deletion and the cleanup job call `ImageStore` explicitly and do not rely on the foreign key cascade alone, because a cascade cannot reach a store outside the database. The database implementation may still use the cascade internally.

The server writes the bytes before the metadata row and deletes the metadata row before the bytes. A crash between the two steps leaves at worst unreachable bytes, never a metadata row whose bytes are missing. The same order holds for a store that shares no transaction with PostgreSQL.

The order alone does not protect against concurrent requests. Suppose the cleanup job deletes a metadata row, an upload of the same bytes writes the bytes and a new row, and the job then deletes the bytes. The new row now points at nothing, and every later upload dedupes against it. The order also lets two uploads each pass the cap check. So every operation that writes or deletes images of one map runs inside a transaction that first takes `pg_advisory_xact_lock(hashtextextended('mmp_image:' || mapId, 0))`: upload, the cleanup job per map, and map duplication for the target map. The lock serializes these operations per map and leaves other maps and persists unblocked. The server runs as one instance, so contention stays low. The lock lives in PostgreSQL, so it still works when an object store replaces `mmp_image_data`.

`put` in `ImageStore` is idempotent: the database implementation inserts with `ON CONFLICT DO NOTHING`, so a retry after a crash between bytes and metadata succeeds. The metadata insert also uses `ON CONFLICT DO NOTHING` and then renews `lastUsedAt`, even though the lock rules out a conflict, so a bug in the locking can only skip a write and never cause an error.

Map deletion relies on the cascade for the rows and calls `ImageStore` for the bytes. An upload that runs while its map gets deleted fails the foreign key check, and the endpoint answers 404, as it does for a missing map.

Alternative considered: a repository on the image entity, called from each service. That spreads byte access over several services, and the switch would then touch each of them.

### Metadata and bytes live in separate tables

`mmp_image` holds the metadata: `mapId`, `hash`, `mime`, `size` and `lastUsedAt`, with primary key `(mapId, hash)`. Dedupe, the per-map cap (the sum of `size`) and the cleanup job read only this table.

`mmp_image_data` holds `mapId`, `hash` and `bytes`, and only the database implementation of `ImageStore` reads or writes it. The switch drops this table and keeps `mmp_image`.

Alternative considered: one table with a `bytes` column. The switch would then need a column migration on the table that dedupe, the cap and the cleanup job query, and a query selecting `*` would load every image's bytes.

### Schema

The migration creates both tables with this SQL:

```sql
CREATE TABLE "mmp_image" (
  "mapId" uuid NOT NULL,
  "hash" char(64) NOT NULL,
  "mime" varchar(16) NOT NULL,
  "size" integer NOT NULL,
  "lastUsedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_mmp_image" PRIMARY KEY ("mapId", "hash"),
  CONSTRAINT "FK_mmp_image_mapId" FOREIGN KEY ("mapId")
    REFERENCES "mmp_map"("id") ON DELETE CASCADE,
  CONSTRAINT "CHK_mmp_image_hash" CHECK ("hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CHK_mmp_image_mime"
    CHECK ("mime" IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
  CONSTRAINT "CHK_mmp_image_size" CHECK ("size" > 0)
);

CREATE TABLE "mmp_image_data" (
  "mapId" uuid NOT NULL,
  "hash" char(64) NOT NULL,
  "bytes" bytea NOT NULL,
  CONSTRAINT "PK_mmp_image_data" PRIMARY KEY ("mapId", "hash"),
  CONSTRAINT "FK_mmp_image_data_mapId" FOREIGN KEY ("mapId")
    REFERENCES "mmp_map"("id") ON DELETE CASCADE
);

ALTER TABLE "mmp_image_data" ALTER COLUMN "bytes" SET STORAGE EXTERNAL;
```

The down migration drops `mmp_image_data`, then `mmp_image`.

- `hash` stores the 64 hex characters of the reference, so the reference, the URL and the key carry one value and no code converts between hex and binary. The check rejects a key that no reference could name.
- `mime` holds the MIME type the data URL declares. The GET endpoint sends it as `Content-Type`, so the check keeps the database from ever serving a type outside the raster allowlist of `sanitizeImageSrc`, such as `text/html`. Adding a format needs a migration that widens the check.
- `size` counts decoded bytes. `MAX_IMAGE_SRC_LENGTH` bounds one image well below the `integer` range; the cap query sums with `SUM("size")::bigint`.
- The primary key of each table starts with `mapId`, so its index serves the cap sum, the cleanup scan per map, map duplication and the cascade. Neither table needs a second index.
- `mmp_image_data` has no foreign key to `mmp_image`. The server writes the bytes before the metadata row, which such a key would reject, and an object store could not enforce one.
- `STORAGE EXTERNAL` stores `bytes` out of line without compression. JPEG, PNG, GIF and WebP arrive compressed, so the default `EXTENDED` storage would spend CPU on a compression attempt that saves nothing.

The entities `MmpImage` and `MmpImageData` map these columns with `@PrimaryColumn` on `mapId` and `hash`, and a `@ManyToOne` to `MmpMap` with `onDelete: 'CASCADE'` joined on `mapId`. Following the TypeScript strictness rule 3, every column takes `!` and no initializer, so the `lastUsedAt` default applies on insert.

### References and URLs name no store

A node holds `image:<hash>`, and the frontend resolves it to `/api/maps/:id/images/:hash`. Neither names the store, so the switch migrates no node, no Y.Doc and no cached frontend. After the switch, the endpoint can proxy the store or redirect to it without any change on the client.

Alternative considered: storing a store key or a direct object URL in the node. Every node would then need rewriting when the store or its address changes.

### mmp resolves references through a frontend callback

`packages/mmp` takes an image URL resolver as a map option, and the frontend supplies one that maps `image:<hash>` to `/api/maps/:id/images/:hash`. mmp names no API path.

A failed load hides the image element and leaves `node.image.src` unchanged. Today `setImage` in `handlers/draw.ts` sets `node.image.src = ''` in `onerror`, and `writeNodeUpdateToYDoc` writes the whole `image` object on the next image change. With references, any network error or 404 would then erase the image in the Y.Doc for every client, and copying the node would copy the empty value.

### MapSyncService owns the upload and the map id

`MapSyncService` holds the modification secret, the attached map with its uuid and `HttpService`, and it already injects `MmpService`. The reverse injection would create a cycle, and the `id` argument of `MmpService.create` holds the DOM id `map_1`, not the map uuid. So `MapSyncService` registers an image source on `MmpService` when it prepares a map:

```ts
interface NodeImageSource {
  resolve(reference: string): string
  upload(dataUrl: string): Promise<string>
}
```

Both functions read the uuid from `getAttachedMap()` and the secret at call time, so switching maps needs no new registration. `MmpService` passes mmp a resolver that delegates to the registered source, and reads the source through an accessor that throws before registration, following TypeScript strictness rule 4.

`addNodeImage` reads the id of the selected node before it starts the upload, and sets the returned reference on that node by id. A user who selects another node during the upload does not move the image, and a node deleted during the upload gets no image.

### The upload endpoint decodes the data URL itself

The toolbar, the pictogram dialog and image drop already produce a data URL and pass it to `MmpService.addNodeImage`. That method uploads the data URL and sets the returned reference, so none of the three callers changes.

The endpoint cannot validate with `sanitizeImageSrc`: once that function accepts `image:<hash>` it lets references through, and it returns `''` for bad input instead of throwing. A new function `parseImageDataUrl` in `sanitization.ts` returns `{ mime, bytes }` for a base64 data URL with a MIME type from the raster allowlist and valid base64, and `null` for anything else, including a reference. `sanitizeImageSrc` and `parseImageDataUrl` share the allowlist, so the two cannot drift apart. The endpoint answers 400 for `null` and for input longer than `MAX_IMAGE_SRC_LENGTH`, and checks the secret with `checkWriteAccess`.

Nest's default JSON limit of 100 KB is below `MAX_IMAGE_SRC_LENGTH`, so the upload route needs a larger body limit.

Both endpoints answer 404 for a map id that is not a uuid, before any query runs, because PostgreSQL rejects the cast with an error that would otherwise become a 500. The GET endpoint also answers 404 for a `:hash` that fails `^[0-9a-f]{64}$`.

`packages/shared` defines the request body `{ dataUrl }` and the response `{ reference }` as valibot schemas with their derived types, and both the controller and `NodeImageSource.upload` import them.

### Exports inline images through a separate async path

`exportAsJSON` stays synchronous and keeps references, because the local map cache (`updateAttachedMap`) and the Mermaid export call it and need no image bytes. The JSON download calls a new async method that runs `exportAsJSON`, fetches each distinct referenced image once, and replaces every reference with its data URL. `convertImages` in `handlers/export.ts` does the same for the image elements of SVG, PNG, JPG and PDF.

When a fetch fails, the export drops that image from the node instead of keeping the reference. An exported file then never contains a reference that it cannot resolve on its own.

### The cleanup job asks the gateway for open maps

`YjsGateway` tracks connections per map in the private `mapConnections`. The job needs a public method on the gateway that reports whether a map has a connection. The server runs as a single instance, so the in-memory count is complete.

An open map keeps its unreferenced images only while their `lastUsedAt` falls within 7 days. Without that limit, a map that some client always has open never releases storage, and a user who removed images to get below the cap would keep getting 413. The limit costs undo in a tab that has stayed open for more than 7 days: undoing an image removal there restores a reference that answers 404, and the node shows no image.

## Risks / Trade-offs

- [Two tables need two writes per upload] → The write order above keeps a crash harmless, and the per-map lock keeps concurrent requests from interleaving.
- [The per-map lock serializes uploads to one map] → An upload holds the lock for one hash, one lookup and two inserts. A burst of pictograms on one map queues for milliseconds.
- [A later redirect to another origin taints the export canvas: PNG and SVG export draw images into a canvas, and a cross-origin image without CORS headers makes the export fail] → The later change either proxies the store through the same origin or sets CORS headers on the store. This change serves from the same origin.

## Migration Plan

1. A TypeORM migration creates `mmp_image` and `mmp_image_data`, both with a foreign key to `mmp_map` that cascades on delete. It moves no data.
2. Deploy the backend before or together with the frontend. An older cached frontend keeps writing data URLs, which the server accepts unchanged.
3. Rollback: revert the backend and frontend and run the down migration. Nodes that hold references then lose their images, so roll back only before users add images through the new flow, or export the affected maps as JSON first, since exports inline the images.
