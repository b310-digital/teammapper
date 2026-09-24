# node-operations Specification

## Purpose

Defines what a user can do with a single node of a mind map: add, remove, style, move, and attach images and links.

## Requirements

### Requirement: User can add and remove child nodes
The system SHALL allow users to add a child node to the currently selected node via an add button, and remove a selected node via a remove button. The add button SHALL accept any selected node as a parent, including a root. Removing a node SHALL remove its descendants with it.

#### Scenario: Add a child node
- **WHEN** the user clicks the add node button and types a node name
- **THEN** the new node SHALL appear on the map

#### Scenario: Remove a node
- **WHEN** the user selects a node and clicks the remove node button
- **THEN** the node SHALL no longer be visible on the map

#### Scenario: Add a child to a root outside the main tree
- **WHEN** the user selects a root that does not carry the main-root mark and clicks the add node button
- **THEN** the new node SHALL attach to that root as a child

#### Scenario: Remove a node with descendants
- **WHEN** the user removes a node that has two descendants
- **THEN** the node and both descendants SHALL disappear from the map

### Requirement: User can create a tree from the toolbar
The system SHALL provide an add-tree button in place of the add-detached-node button. The button SHALL create a root with no parent, no children and no main-root mark, and SHALL stay enabled when no node is selected.

#### Scenario: Create a tree
- **WHEN** the user clicks the add-tree button and types a name
- **THEN** a new root SHALL appear on the map, clear of the trees the client holds
- **AND** the new root SHALL accept children

#### Scenario: Create a tree with nothing selected
- **WHEN** no node is selected and the user clicks the add-tree button
- **THEN** a new root SHALL appear on the map

### Requirement: User can toggle bold and italic text styles on nodes
The system SHALL provide bold and italic toggle buttons that apply font styles to the selected node's text. Styles SHALL be independently togglable and composable.

#### Scenario: Toggle bold on
- **WHEN** the user selects a node and activates bold
- **THEN** the node text SHALL render in bold

#### Scenario: Toggle italic on while bold is active
- **WHEN** bold is active and the user activates italic
- **THEN** the node text SHALL render in both bold and italic

#### Scenario: Toggle bold off leaving only italic
- **WHEN** both bold and italic are active and the user deactivates bold
- **THEN** the node text SHALL render in italic only

#### Scenario: Toggle italic off returning to normal
- **WHEN** only italic is active and the user deactivates italic
- **THEN** the node text SHALL render in normal style

### Requirement: User can drag nodes to reposition them
The system SHALL allow users to drag nodes to new positions on the map. The node's visual position SHALL change after dragging.

#### Scenario: Drag a node to a new position
- **WHEN** the user drags a node to a different location
- **THEN** the map layout SHALL visually change to reflect the new position

### Requirement: User can upload images to nodes
The system SHALL allow users to upload an image file to a selected node. The image SHALL be displayed above the node text with positive dimensions. The file input SHALL only accept raster image formats (PNG, JPEG, GIF, WebP) and SHALL reject SVG files.

#### Scenario: Upload image to a node
- **WHEN** the user selects a node and uploads an image file
- **THEN** the image SHALL be displayed on the node as a base64-encoded image
- **AND** the image SHALL have positive width and height
- **AND** the image SHALL be positioned above the node text

#### Scenario: File picker restricts to raster formats
- **WHEN** the user opens the image upload file picker
- **THEN** the file picker SHALL filter for PNG, JPEG, GIF, and WebP formats only
- **AND** SVG files SHALL NOT be selectable by default

#### Scenario: SVG file type rejected before processing
- **WHEN** the user bypasses the file picker filter and selects an SVG file
- **THEN** the system SHALL reject the file before processing
- **AND** no image SHALL be added to the node

### Requirement: User can add and remove hyperlinks on nodes
The system SHALL allow users to attach a URL hyperlink to a selected node. The link SHALL be visible on the node and users SHALL be able to remove it. The system SHALL only accept links with `http:` or `https:` protocol.

#### Scenario: Add a link to a node
- **WHEN** the user selects a node and adds a URL via the add link action
- **THEN** the link SHALL be rendered on the node with the provided URL
- **AND** a link indicator text SHALL be visible

#### Scenario: Remove a link from a node
- **WHEN** the user removes a link from a node
- **THEN** the link SHALL no longer be visible on the node

#### Scenario: Reject javascript protocol link
- **WHEN** the user attempts to add a link with `javascript:alert(1)` as the URL
- **THEN** the system SHALL reject the link as invalid
- **AND** no link SHALL be added to the node

#### Scenario: Reject data protocol link
- **WHEN** the user attempts to add a link with `data:text/html,...` as the URL
- **THEN** the system SHALL reject the link as invalid

### Requirement: Paste into node name SHALL insert plain text only
The system SHALL insert pasted content as plain text when the user pastes into a node name editor. HTML markup in pasted content SHALL NOT be interpreted as HTML.

#### Scenario: Paste HTML content into node name
- **WHEN** the user pastes text containing HTML tags (e.g., `<b>bold</b>`) into a node name
- **THEN** the node name SHALL contain the literal text without HTML interpretation
- **AND** no HTML elements SHALL be created in the DOM from the pasted content
