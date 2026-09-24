## MODIFIED Requirements

### Requirement: Y.Doc structure mirrors node model

Each Y.Doc SHALL contain a `Y.Map("nodes")` where keys are node IDs and values are `Y.Map` instances with the same fields as `ExportNodeProperties` (id, parent, name, isRoot, protected, detached, k, coordinates, colors, font, image, link). The `locked` field SHALL NOT be written. A separate `Y.Map("mapOptions")` SHALL hold map-level metadata.

#### Scenario: Y.Doc hydrated from database

- **WHEN** a Y.Doc is created from database rows
- **THEN** each MmpNode row SHALL be converted to a Y.Map entry in the `nodes` map with all `ExportNodeProperties` fields populated

#### Scenario: Node added to Y.Doc

- **WHEN** a client adds a new entry to the `nodes` Y.Map
- **THEN** the entry SHALL be a Y.Map containing all required `ExportNodeProperties` fields
- **AND** `protected` SHALL be `false` unless the node is protected

#### Scenario: Y.Doc holds several roots

- **WHEN** a map with three trees is hydrated
- **THEN** the `nodes` map SHALL hold three entries with no parent
- **AND** one of them SHALL carry the main-root mark
