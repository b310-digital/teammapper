## MODIFIED Requirements

### Requirement: User can upload images to nodes
The system SHALL allow users to upload an image file to a selected node. The image SHALL be displayed above the node text with positive dimensions. The node SHALL reference the uploaded image instead of holding its bytes. The file input SHALL only accept raster image formats (PNG, JPEG, GIF, WebP) and SHALL reject SVG files.

#### Scenario: Upload image to a node
- **WHEN** the user selects a node and uploads an image file
- **THEN** the image SHALL be displayed on the node, loaded from the map's image endpoint
- **AND** the node's image SHALL be an `image:<uuid>` reference
- **AND** the image SHALL have positive width and height
- **AND** the image SHALL be positioned above the node text

#### Scenario: Other clients see the uploaded image
- **WHEN** the user uploads an image to a node while a second client has the map open
- **THEN** the second client SHALL display the image on that node

#### Scenario: File picker restricts to raster formats
- **WHEN** the user opens the image upload file picker
- **THEN** the file picker SHALL filter for PNG, JPEG, GIF, and WebP formats only
- **AND** SVG files SHALL NOT be selectable by default

#### Scenario: SVG file type rejected before processing
- **WHEN** the user bypasses the file picker filter and selects an SVG file
- **THEN** the system SHALL reject the file before processing
- **AND** no image SHALL be added to the node
