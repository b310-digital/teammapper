## MODIFIED Requirements

### Requirement: Node names SHALL be plain text only

The system SHALL strip all HTML markup from node names. Only plain text content SHALL be persisted. For a markdown name, the plain text is the markdown source, and the renderer SHALL build its output from text nodes and the elements `strong`, `em` and `br` only, never by interpreting the name as HTML.

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

- **WHEN** a user sets a markdown name to `**bold** _x_`
- **THEN** the system SHALL store `**bold** _x_` unchanged

#### Scenario: Markup from a peer is not interpreted

- **WHEN** a markdown name arriving through sync or import holds `<img src=x onerror=alert(1)>`
- **THEN** the renderer SHALL show it as text and create no image element

## ADDED Requirements

### Requirement: Node name format SHALL use allowed values only

The system SHALL accept only `text` or `markdown` for a node's `nameFormat`. A missing or unrecognized value SHALL be read as `text`.

#### Scenario: Unrecognized format

- **WHEN** a node arrives with `nameFormat` set to `html`
- **THEN** the system SHALL treat the node as having the format `text`
