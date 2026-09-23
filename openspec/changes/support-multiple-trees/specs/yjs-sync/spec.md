## MODIFIED Requirements

### Requirement: Y.Doc structure mirrors node model
Each Y.Doc SHALL contain a `Y.Map("nodes")` where keys are node IDs and values are `Y.Map` instances with the same fields as `ExportNodeProperties` (id, parent, name, isRoot, locked, k, coordinates, colors, font, image, link). `isRoot` SHALL mark the main root. A node with no parent is a root, and a Y.Doc MAY hold several roots. Exactly one node SHALL carry the main-root mark. The detached property SHALL NOT be written. A separate `Y.Map("mapOptions")` SHALL hold map-level metadata.

#### Scenario: Y.Doc hydrated from database
- **WHEN** a Y.Doc is created from database rows
- **THEN** each MmpNode row SHALL be converted to a Y.Map entry in the `nodes` map with all `ExportNodeProperties` fields populated

#### Scenario: Node added to Y.Doc
- **WHEN** a client adds a new entry to the `nodes` Y.Map
- **THEN** the entry SHALL be a Y.Map containing all required `ExportNodeProperties` fields

#### Scenario: Y.Doc holds several roots
- **WHEN** a map with three trees is hydrated
- **THEN** the `nodes` map SHALL hold three entries with no parent
- **AND** one of them SHALL carry the main-root mark

## ADDED Requirements

### Requirement: Full-map replacement detection reads the main-root mark only
The frontend SHALL classify a remote or undo transaction as a full-map replacement when it adds or rewrites the top-level `nodes` entry of the node carrying the main-root mark, which an import, a redistribution and an undo of either produce. A transaction that adds a root without the main-root mark SHALL be applied as an ordinary node add.

#### Scenario: Peer adds a tree
- **WHEN** a remote client creates a root and the transaction reaches this client
- **THEN** this client SHALL add the node without reloading the map
- **AND** the undo history SHALL keep its entries

#### Scenario: Peer pastes a tree
- **WHEN** a remote client pastes a tree with no node selected and the transaction reaches this client
- **THEN** this client SHALL add the pasted nodes without reloading the map
- **AND** the undo history SHALL keep its entries

#### Scenario: Peer imports a map
- **WHEN** a remote client imports a map, replacing every node in one transaction
- **THEN** this client SHALL reload the map from the Y.Doc
- **AND** the undo history SHALL be cleared

#### Scenario: Peer redistributes a map
- **WHEN** a remote client redistributes a map, rewriting every node under its existing ID
- **THEN** this client SHALL reload the map from the Y.Doc
- **AND** the map SHALL hold exactly one node carrying the main-root mark

#### Scenario: Local import does not clear the history of the importing client
- **WHEN** the local client imports a map
- **THEN** that client SHALL reload the map from the Y.Doc
- **AND** the undo history SHALL keep its entries

### Requirement: Batched adds are ordered across roots
When a transaction adds several nodes, the receiving client SHALL order them so that every parent precedes its children, across all trees.

#### Scenario: Remote client pastes a tree
- **WHEN** a remote client pastes a root with two levels of descendants in one transaction
- **THEN** the receiving client SHALL add the root before its children and each child before its own children
- **AND** every added node SHALL find its parent already present
