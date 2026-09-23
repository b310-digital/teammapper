# Spec Delta

## Purpose

Stores the bytes of newly added node images once per map, outside the node, so that nodes, the Y.Doc and persists carry a short reference instead of a base64 data URL.

## ADDED Requirements

### Requirement: A node image reference names the image by content hash
A node image reference SHALL have the form `image:<hash>`, where `<hash>` is the lowercase hex sha256 of the image bytes. The reference SHALL NOT contain the map id, so the same reference stays valid in a copy of the map.

#### Scenario: Reference format
- **WHEN** the server stores an image
- **THEN** the returned reference SHALL be `image:` followed by 64 lowercase hex characters
- **AND** the hex characters SHALL equal the sha256 of the stored bytes

### Requirement: The server stores each image once per map
The server SHALL store image bytes together with their MIME type, keyed by map and hash. Storing bytes that the map already holds SHALL return the existing reference, SHALL NOT add a second copy, and SHALL mark the image as used at that moment. Two maps holding the same bytes SHALL each hold their own copy.

#### Scenario: Same pictogram on two nodes
- **WHEN** a client uploads the same image twice to one map
- **THEN** both uploads SHALL return the same reference
- **AND** the map SHALL hold the image once

#### Scenario: Same image in two maps
- **WHEN** a client uploads the same image to map A and to map B
- **THEN** each map SHALL hold its own copy
- **AND** deleting map A SHALL leave the copy of map B readable

#### Scenario: Concurrent uploads of the same image
- **WHEN** two clients upload the same image to one map at the same time
- **THEN** both uploads SHALL succeed with the same reference
- **AND** the map SHALL hold the image once

#### Scenario: Retry after an interrupted upload
- **GIVEN** an upload that stored the bytes and failed before storing the metadata
- **WHEN** a client uploads the same image again
- **THEN** the server SHALL respond with the image's reference
- **AND** a request for that reference SHALL return the image

#### Scenario: Upload during the daily job
- **WHEN** a client uploads an image while the daily job deletes the same unused image from that map
- **THEN** the returned reference SHALL resolve to the image after both finish

### Requirement: Clients upload an image through the map's image endpoint
`POST /api/maps/:id/images` SHALL take the image as the data URL the frontend already produces, SHALL store its decoded bytes for map `:id`, and SHALL respond with the image's reference. The endpoint SHALL require the modification secret of the map in the `secret` query parameter, as `GET /api/maps/:id` does. The endpoint SHALL accept only a base64 data URL with a raster MIME type (JPEG, PNG, GIF, WebP), SHALL reject every other value with status 400, including an `image:<hash>` reference, and SHALL reject a data URL longer than `MAX_IMAGE_SRC_LENGTH`. The stored MIME type SHALL be the one the data URL declares. The endpoint SHALL answer not found for a map id that is not a uuid.

#### Scenario: Upload with a valid secret
- **WHEN** a client posts a PNG image with the map's modification secret
- **THEN** the server SHALL respond with the image's reference

#### Scenario: Upload without a valid secret
- **WHEN** a client posts an image without the modification secret, or with a wrong one
- **THEN** the server SHALL reject the request
- **AND** the server SHALL store no image

#### Scenario: SVG upload rejected
- **WHEN** a client posts an SVG image with a valid secret
- **THEN** the server SHALL reject the request
- **AND** the server SHALL store no image

#### Scenario: Oversized image rejected
- **WHEN** a client posts a data URL longer than `MAX_IMAGE_SRC_LENGTH`
- **THEN** the server SHALL reject the request

#### Scenario: Reference posted as an image
- **WHEN** a client posts `image:` followed by 64 hex characters with a valid secret
- **THEN** the server SHALL respond with status 400
- **AND** the server SHALL store no image

#### Scenario: Upload to a missing map
- **WHEN** a client posts an image for a map id that does not exist, or that is not a uuid
- **THEN** the server SHALL respond with not found

### Requirement: Each map has an image storage cap
The server SHALL reject an upload with status 413 when storing it would raise the total size of the map's images above the cap. The `MAX_IMAGE_BYTES_PER_MAP` setting SHALL define the cap, with a default of 50 MB. An upload of bytes that the map already holds SHALL succeed regardless of the cap, since it stores nothing. Concurrent uploads SHALL NOT together raise the total above the cap.

#### Scenario: Concurrent uploads near the cap
- **GIVEN** a map with room below the cap for one of two new images
- **WHEN** two clients upload the two images at the same time
- **THEN** one upload SHALL succeed
- **AND** the other SHALL receive status 413

#### Scenario: Upload beyond the cap
- **GIVEN** a map whose images total just below the cap
- **WHEN** a client uploads a new image that would exceed the cap
- **THEN** the server SHALL respond with status 413
- **AND** the server SHALL store no image

#### Scenario: Re-upload at the cap
- **GIVEN** a map whose images reach the cap
- **WHEN** a client uploads an image that the map already holds
- **THEN** the server SHALL respond with the existing reference

### Requirement: Clients read an image through the map's image endpoint
`GET /api/maps/:id/images/:hash` SHALL respond with the stored bytes of that map and the stored MIME type as `Content-Type`. The response SHALL carry `Cache-Control: public, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`. The endpoint SHALL require no modification secret, so view-only users see images. The endpoint SHALL answer not found for a hash the map does not hold, including a hash that only another map holds, for a hash that is not 64 lowercase hex characters, and for a map id that is not a uuid.

#### Scenario: Read a stored image
- **WHEN** a client requests a hash that the map holds
- **THEN** the server SHALL respond with the image bytes and their MIME type
- **AND** the response SHALL mark the image as immutable and forbid MIME sniffing

#### Scenario: Hash of another map
- **WHEN** a client requests from map A a hash that only map B holds
- **THEN** the server SHALL respond with not found

#### Scenario: Malformed hash or map id
- **WHEN** a client requests a hash such as `../secret`, or uses a map id that is not a uuid
- **THEN** the server SHALL respond with not found

### Requirement: The frontend uploads a new image before setting it on a node
When a user adds an image to a node, the frontend SHALL upload the image first and SHALL set the returned reference as the image of the node that was selected when the upload started. The frontend SHALL NOT write the bytes of a new image into the Y.Doc. When the upload fails, the node SHALL keep its previous image and the frontend SHALL show an error.

#### Scenario: Image added to a node
- **WHEN** a user adds a JPEG image to a node
- **THEN** the node's image in the Y.Doc SHALL be an `image:<hash>` reference

#### Scenario: Upload fails
- **WHEN** the image upload fails, including a rejection for the storage cap
- **THEN** the node SHALL keep its previous image
- **AND** the user SHALL see an error message

#### Scenario: Selection changes during the upload
- **GIVEN** a user who adds an image to node A
- **WHEN** the user selects node B before the upload finishes
- **THEN** node A SHALL receive the reference
- **AND** node B SHALL keep its image

### Requirement: The frontend renders both image forms
The frontend SHALL render a node image given as a data URL as is. The frontend SHALL render a node image given as a reference from `/api/maps/<id>/images/<hash>`, where `<id>` is the id of the open map. When the image fails to load, the node SHALL display no image and SHALL keep its image value unchanged, in the frontend's model and in the Y.Doc.

#### Scenario: Node with a data URL
- **WHEN** a map holds a node whose image is a data URL
- **THEN** the node SHALL display the image

#### Scenario: Node with a reference
- **WHEN** a map holds a node whose image is `image:<hash>`
- **THEN** the node SHALL display the image loaded from the image endpoint of the open map

#### Scenario: Both forms in one map
- **WHEN** a map holds one node with a data URL and one with a reference
- **THEN** both nodes SHALL display their images

#### Scenario: Image fails to load
- **GIVEN** a node whose image is a reference that fails to load
- **WHEN** the user changes the image size of that node
- **THEN** the node's image in the Y.Doc SHALL still hold the reference
- **AND** the node SHALL display the image on another client once the image loads there

### Requirement: Removing an image from a node keeps the stored image
Deleting a node, replacing its image or removing its image SHALL NOT delete the stored image. Undo and redo SHALL restore a reference that still resolves.

#### Scenario: Undo of a node delete
- **GIVEN** a node whose image is a reference
- **WHEN** the user deletes the node and triggers undo
- **THEN** the restored node SHALL display its image

#### Scenario: Undo of an image replacement
- **WHEN** the user replaces a node's image and triggers undo
- **THEN** the node SHALL display its previous image

### Requirement: A daily job deletes unused images
Once a day the server SHALL delete every stored image that meets all three conditions:

1. No node row of its map references it.
2. No client has its map open, or the image has not been uploaded or re-uploaded for 7 days.
3. It has not been uploaded or re-uploaded for 24 hours.

The server SHALL keep every other image.

#### Scenario: Unused image deleted
- **GIVEN** an image that no node row references, uploaded 3 days ago, in a map no client has open
- **WHEN** the daily job runs
- **THEN** the server SHALL delete the image

#### Scenario: Referenced image kept
- **GIVEN** an image that a node row of its map references
- **WHEN** the daily job runs
- **THEN** the server SHALL keep the image

#### Scenario: Open map releases images unused for 7 days
- **GIVEN** an image that no node row references, uploaded 8 days ago, in a map a client has open
- **WHEN** the daily job runs
- **THEN** the server SHALL delete the image

#### Scenario: Open map keeps its recent images
- **GIVEN** an image that no node row references, uploaded 3 days ago, in a map a client has open
- **WHEN** the daily job runs
- **THEN** the server SHALL keep the image
- **AND** an undo in that client SHALL restore a reference that resolves

#### Scenario: Recent upload kept
- **GIVEN** an image uploaded 1 hour ago that no node row references yet
- **WHEN** the daily job runs
- **THEN** the server SHALL keep the image

#### Scenario: Re-upload renews an old image
- **GIVEN** an unreferenced image first uploaded 10 days ago
- **WHEN** a client uploads the same bytes again and the daily job runs within 24 hours
- **THEN** the server SHALL keep the image

### Requirement: Images follow their map
Duplicating a map SHALL copy every image of the source map to the new map, referenced or not, SHALL set the `lastUsedAt` of each copy to the time of duplication, and SHALL leave the node references unchanged. Deleting a map SHALL delete every image of the map.

#### Scenario: Duplicate a map with images
- **WHEN** the user duplicates a map whose nodes reference images
- **THEN** every node of the new map SHALL display its image
- **AND** deleting the source map SHALL leave the images of the new map readable

#### Scenario: Delete a map with images
- **WHEN** a map is deleted, by a user or by the job that deletes outdated maps
- **THEN** no image of that map SHALL remain
- **AND** a request for any of its hashes SHALL respond with not found
