# input-sanitization Specification

## Purpose

Keeps node fields free of markup, unsafe protocols and invalid values, whether the data arrives through editing, collaboration or import.

## Requirements

### Requirement: Node names SHALL be plain text only
The system SHALL strip all HTML markup from node names. Only plain text content SHALL be persisted.

#### Scenario: HTML tags stripped from node name
- **WHEN** a user sets a node name containing HTML tags like `<img src=x onerror=alert(1)>Hello`
- **THEN** the system SHALL store only the text content `Hello`

#### Scenario: Plain text name passes through unchanged
- **WHEN** a user sets a node name to `My Node`
- **THEN** the system SHALL store `My Node` unchanged

#### Scenario: Empty name is accepted
- **WHEN** a user clears a node name
- **THEN** the system SHALL store an empty string

### Requirement: Node images SHALL only accept raster formats
The system SHALL accept a node image in two forms: an `image:<uuid>` reference, where `<uuid>` is a lowercase uuid, or a base64-encoded data URI with a raster MIME type (JPEG, PNG, GIF, WebP). SVG images, malformed references and other values SHALL be rejected. The system SHALL store an accepted data URI unchanged.

#### Scenario: Valid JPEG image accepted
- **WHEN** a user uploads a JPEG image to a node
- **THEN** the system SHALL store the image and set its reference on the node

#### Scenario: Valid reference accepted
- **WHEN** a node image is set to `image:` followed by a lowercase uuid
- **THEN** the system SHALL store the reference unchanged

#### Scenario: Raster data URI accepted
- **WHEN** a node image arrives as a base64 JPEG data URI, from an existing map, an older client or an import
- **THEN** the system SHALL store the data URI unchanged

#### Scenario: Malformed reference rejected
- **WHEN** a node image is set to `image:../secret` or to `image:` followed by anything other than a lowercase uuid
- **THEN** the system SHALL reject it and store no image

#### Scenario: SVG image rejected
- **WHEN** a user attempts to set a node image to an SVG
- **THEN** the system SHALL reject it and store no image

#### Scenario: Non-image content rejected
- **WHEN** a user attempts to set a node image to a non-image value
- **THEN** the system SHALL reject it and store no image

### Requirement: Node links SHALL only use safe protocols
The system SHALL only accept node links with `http:` or `https:` protocol. All other protocols SHALL be rejected.

#### Scenario: HTTPS link accepted
- **WHEN** a user adds a link `https://example.com` to a node
- **THEN** the system SHALL store the link unchanged

#### Scenario: JavaScript protocol rejected
- **WHEN** a user attempts to add a `javascript:` link to a node
- **THEN** the system SHALL reject the link and store no link

#### Scenario: Data URI protocol rejected
- **WHEN** a user attempts to add a `data:` link to a node
- **THEN** the system SHALL reject the link and store no link

### Requirement: Node colors SHALL be valid hex values
The system SHALL only accept node color values in hex format (`#rrggbb` or `#rrggbbaa`). Invalid color values SHALL be rejected.

#### Scenario: Hex color accepted
- **WHEN** a user picks a color `#ff0000` for a node
- **THEN** the system SHALL store the color unchanged

#### Scenario: Invalid color value rejected
- **WHEN** a node color is set to a non-hex value
- **THEN** the system SHALL reject it and store an empty value

### Requirement: Node font styles SHALL use allowed values only
The system SHALL only accept `normal` or `italic` for font style, and `normal` or `bold` for font weight. Any other value SHALL be replaced with `normal`.

#### Scenario: Valid font style accepted
- **WHEN** a user sets a node font style to `italic`
- **THEN** the system SHALL store `italic`

#### Scenario: Invalid font style replaced with default
- **WHEN** a node font style is set to an unrecognized value
- **THEN** the system SHALL store `normal`

### Requirement: Node fields SHALL have maximum length limits
The system SHALL enforce maximum lengths on node text fields. Values exceeding the limit SHALL be rejected.

#### Scenario: Name within limit accepted
- **WHEN** a user enters a node name of 500 characters
- **THEN** the system SHALL accept it

#### Scenario: Name exceeding limit rejected
- **WHEN** a user enters a node name exceeding 512 characters
- **THEN** the system SHALL reject the value

### Requirement: Input sanitization SHALL apply regardless of how data enters the system
The system SHALL sanitize all node fields consistently whether the data arrives via direct editing, real-time collaboration, or map import.

#### Scenario: Malicious content via real-time collaboration is sanitized
- **WHEN** a collaborator sends node data containing malicious content
- **THEN** the persisted node SHALL have all fields sanitized

#### Scenario: Malicious content via map import is sanitized
- **WHEN** a user imports a map containing nodes with malicious content
- **THEN** the persisted nodes SHALL have all fields sanitized
