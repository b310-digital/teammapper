## MODIFIED Requirements

### Requirement: Node images SHALL only accept raster formats
The system SHALL accept a node image in two forms: an `image:<hash>` reference, where `<hash>` is 64 lowercase hex characters, or a base64-encoded data URI with a raster MIME type (JPEG, PNG, GIF, WebP). SVG images, malformed references and other values SHALL be rejected. The system SHALL store an accepted data URI unchanged.

#### Scenario: Valid JPEG image accepted
- **WHEN** a user uploads a JPEG image to a node
- **THEN** the system SHALL store the image and set its reference on the node

#### Scenario: Valid reference accepted
- **WHEN** a node image is set to `image:` followed by 64 lowercase hex characters
- **THEN** the system SHALL store the reference unchanged

#### Scenario: Raster data URI accepted
- **WHEN** a node image arrives as a base64 JPEG data URI, from an existing map, an older client or an import
- **THEN** the system SHALL store the data URI unchanged

#### Scenario: Malformed reference rejected
- **WHEN** a node image is set to `image:../secret` or to `image:` followed by anything other than 64 lowercase hex characters
- **THEN** the system SHALL reject it and store no image

#### Scenario: SVG image rejected
- **WHEN** a user attempts to set a node image to an SVG
- **THEN** the system SHALL reject it and store no image

#### Scenario: Non-image content rejected
- **WHEN** a user attempts to set a node image to a non-image value
- **THEN** the system SHALL reject it and store no image
