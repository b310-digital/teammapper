# Spec Delta

## Purpose

Stores the bytes of newly added node images per map, outside the node, so that nodes, the Y.Doc and persists carry a short reference instead of a base64 data URL.

## ADDED Requirements

### Requirement: Each upload is stored as its own image
The server SHALL store each upload per map under a new uuid and SHALL return the reference `image:<uuid>`. The reference SHALL NOT contain the map id. Uploading the same bytes twice SHALL store two images.

#### Scenario: Same image uploaded twice
- **WHEN** a client uploads the same image twice to one map
- **THEN** the two uploads SHALL return different `image:<uuid>` references
- **AND** both references SHALL resolve to the image

### Requirement: Clients upload an image through the map's image endpoint
`POST /api/maps/:id/images` SHALL take one multipart file in the field `file`, SHALL require the map's modification secret in the `X-Map-Modification-Secret` header, SHALL ignore `Authorization`, which basic auth or an auth proxy in front of TeamMapper may fill, and SHALL accept a file only when both its content and its declared type are raster types (JPEG, PNG, GIF, WebP). `UPLOAD_IMAGE_MAX_SIZE_BYTES` SHALL default to 150000. The endpoint SHALL respond with:

- 201 and `{ reference }` when it stored the image,
- 403 for a missing or wrong secret,
- 404 for a map that does not exist or an id that is not a uuid,
- 413 for a file larger than `UPLOAD_IMAGE_MAX_SIZE_BYTES`, or an upload above the map's cap,
- 422 for a missing file, or a file whose content or declared type is not a raster type,
- 429 above the rate limit.

A rejected upload SHALL store no image.

#### Scenario: Upload with a valid secret
- **WHEN** a client posts a PNG file with the map's modification secret in the `X-Map-Modification-Secret` header
- **THEN** the server SHALL respond with status 201 and the image's reference

#### Scenario: Upload behind basic auth
- **WHEN** a client posts a PNG file with basic auth credentials in `Authorization` and the modification secret in `X-Map-Modification-Secret`
- **THEN** the server SHALL respond with status 201 and the image's reference

#### Scenario: Upload without a valid secret
- **WHEN** a client posts an image without the secret in the `X-Map-Modification-Secret` header, or with a wrong one, or with the secret in `Authorization` only
- **THEN** the server SHALL respond with status 403

#### Scenario: Non-raster file rejected
- **WHEN** a client posts an SVG file, or a file declared as `image/png` whose bytes are not an image
- **THEN** the server SHALL respond with status 422

#### Scenario: Oversized image rejected
- **WHEN** a client posts a file larger than `UPLOAD_IMAGE_MAX_SIZE_BYTES`
- **THEN** the server SHALL respond with status 413

#### Scenario: Upload to a missing map
- **WHEN** a client posts an image for a map id that does not exist, or that is not a uuid
- **THEN** the server SHALL respond with status 404

### Requirement: Uploads are rate limited per client IP
The server SHALL reject an upload with status 429 when the client IP exceeds `UPLOAD_IMAGE_RATE_LIMIT` uploads per `UPLOAD_IMAGE_RATE_WINDOW_MS` (default 30 per 60000 ms), before it reads the file. With `WS_TRUST_PROXY` on, the client IP SHALL come from `X-Forwarded-For`.

#### Scenario: Upload burst from one client
- **GIVEN** a client IP that has made 30 uploads in the last minute
- **WHEN** the client posts another image
- **THEN** the server SHALL respond with status 429
- **AND** a client with another IP SHALL still be able to upload

### Requirement: Each map has an image storage cap
The server SHALL reject an upload with status 413 when it would raise the total size of the map's images above `MAX_IMAGE_BYTES_PER_MAP` (default 50 MB). Concurrent uploads MAY together exceed the cap by the uploads in flight.

#### Scenario: Upload beyond the cap
- **GIVEN** a map whose images total just below the cap
- **WHEN** a client uploads an image that would exceed the cap
- **THEN** the server SHALL respond with status 413

### Requirement: Clients read an image through the map's image endpoint
`GET /api/maps/:id/images/:imageId` SHALL require no secret and SHALL mark the response as inline, immutable and not to be sniffed. The endpoint SHALL respond with:

- 200 with the stored bytes and MIME type for an image the map holds,
- 404 for an image the map does not hold, including one only another map holds, and for an id that is not a uuid.

#### Scenario: Read a stored image
- **WHEN** a client without a secret requests an image the map holds
- **THEN** the server SHALL respond with status 200, the image bytes and their MIME type

#### Scenario: Image of another map
- **WHEN** a client requests from map A an image id that only map B holds
- **THEN** the server SHALL respond with status 404

### Requirement: The frontend uploads a new image before setting it on a node
When a user adds an image to a node, the frontend SHALL upload it and SHALL set the returned reference on the node that was selected when the upload started. The frontend SHALL NOT write the bytes of a new image into the Y.Doc. Images picked in the toolbar or dropped as a file SHALL be resized before the upload. When the upload fails, the node SHALL keep its previous image and the frontend SHALL show an error.

#### Scenario: Image added to a node
- **WHEN** a user adds a JPEG image to a node
- **THEN** the node's image in the Y.Doc SHALL be an `image:<uuid>` reference

#### Scenario: Storage cap reached
- **WHEN** the upload fails with status 413
- **THEN** the node SHALL keep its previous image
- **AND** the user SHALL see a message that the map's image storage is full and that removed images free their space within 7 days of their upload

#### Scenario: Dropped files and markup
- **WHEN** a user drops a photo file onto the map with a node selected
- **THEN** the frontend SHALL resize and upload it
- **AND** dropping an image dragged from another web page SHALL leave the node unchanged

#### Scenario: Selection changes during the upload
- **GIVEN** a user who adds an image to node A
- **WHEN** the user selects node B before the upload finishes
- **THEN** node A SHALL receive the reference
- **AND** node B SHALL keep its image

### Requirement: The frontend renders both image forms
The frontend SHALL render a data URL as is and a reference from the image endpoint of the open map. When an image fails to load, the node SHALL display no image and SHALL keep its image value unchanged, in the frontend's model and in the Y.Doc.

#### Scenario: Both forms in one map
- **WHEN** a map holds one node with a data URL and one with a reference
- **THEN** both nodes SHALL display their images

#### Scenario: Image fails to load
- **GIVEN** a node whose image is a reference that fails to load
- **WHEN** the user changes the image size of that node
- **THEN** the node's image in the Y.Doc SHALL still hold the reference

### Requirement: Removing an image from a node keeps the stored image
Deleting a node, replacing its image or removing its image SHALL NOT delete the stored image, and the server SHALL offer no endpoint that deletes a single image, so undo restores a reference that resolves.

#### Scenario: Undo of a node delete
- **GIVEN** a node whose image is a reference
- **WHEN** the user deletes the node and triggers undo
- **THEN** the restored node SHALL display its image

### Requirement: A daily job deletes unused images
Once a day the server SHALL delete every image that no node row of its map references and that was uploaded more than 7 days ago. The server SHALL keep every other image.

#### Scenario: Unused old image deleted
- **GIVEN** an image that no node row references, uploaded 8 days ago
- **WHEN** the daily job runs
- **THEN** the server SHALL delete the image

#### Scenario: Recent or referenced image kept
- **GIVEN** an image that no node row references, uploaded 3 days ago, and an image that a node row references, uploaded 30 days ago
- **WHEN** the daily job runs
- **THEN** the server SHALL keep both images

### Requirement: Images follow their map
Duplicating a map SHALL copy every image under the same id, with the time of duplication as its upload time, and SHALL leave the node references unchanged. Deleting a map SHALL delete every image of the map.

#### Scenario: Duplicate a map with images
- **WHEN** the user duplicates a map whose nodes reference images and then deletes the source map
- **THEN** every node of the new map SHALL display its image

#### Scenario: Delete a map with images
- **WHEN** a map is deleted, by a user or by the job that deletes outdated maps
- **THEN** a request for any of its images SHALL respond with status 404
