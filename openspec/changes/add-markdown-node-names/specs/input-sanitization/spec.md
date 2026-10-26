## MODIFIED Requirements

### Requirement: Node names SHALL be plain text only

The system SHALL strip all HTML markup from node names. Only plain text content SHALL be persisted, and the persisted text SHALL NOT be HTML-escaped. The plain text is the markdown source of the name. The renderer SHALL build its output from text nodes and the elements `strong`, `em` and `br` only, and SHALL never interpret the name as HTML.

#### Scenario: HTML tags stripped from node name

- **WHEN** a user sets a node name containing HTML tags like `<img src=x onerror=alert(1)>Hello`
- **THEN** the system SHALL store only the text content `Hello`

#### Scenario: Plain text name passes through unchanged

- **WHEN** a user sets a node name to `My Node`
- **THEN** the system SHALL store `My Node` unchanged

#### Scenario: Empty name is accepted

- **WHEN** a user clears a node name
- **THEN** the system SHALL store an empty string

#### Scenario: Markdown source passes through unchanged

- **WHEN** a user sets a node name to `**bold** _x_ & co`
- **THEN** the system SHALL store `**bold** _x_ & co` unchanged

#### Scenario: Markup from a peer is not interpreted

- **WHEN** a name arriving through sync or import holds `<img src=x onerror=alert(1)>`
- **THEN** the renderer SHALL show it as text and create no image element
