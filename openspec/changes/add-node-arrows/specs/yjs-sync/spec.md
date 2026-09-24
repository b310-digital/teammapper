## MODIFIED Requirements

### Requirement: Y.Doc structure mirrors node model

Each Y.Doc SHALL contain a `Y.Map("nodes")` where keys are node IDs and values are `Y.Map` instances with the same fields as `ExportNodeProperties` (id, parent, name, isRoot, locked, k, coordinates, colors, font, image, link). `isRoot` SHALL mark the main root. A node with no parent is a root, and a Y.Doc MAY hold several roots. Exactly one node SHALL carry the main-root mark. The detached property SHALL NOT be written. Each Y.Doc SHALL contain a `Y.Map("arrows")` where keys are `arrowKey(source, target)` and values are `Y.Map` instances with the fields of `MapArrow` (source, target). An arrow entry SHALL NOT be modified after it is written. A separate `Y.Map("mapOptions")` SHALL hold map-level metadata.

#### Scenario: Y.Doc hydrated from database

- **WHEN** a Y.Doc is created from database rows
- **THEN** each MmpNode row SHALL be converted to a Y.Map entry in the `nodes` map with all `ExportNodeProperties` fields populated
- **AND** each MmpArrow row SHALL be converted to a Y.Map entry in the `arrows` map under its arrow key

#### Scenario: Node added to Y.Doc

- **WHEN** a client adds a new entry to the `nodes` Y.Map
- **THEN** the entry SHALL be a Y.Map containing all required `ExportNodeProperties` fields

#### Scenario: Y.Doc holds several roots

- **WHEN** a map with three trees is hydrated
- **THEN** the `nodes` map SHALL hold three entries with no parent
- **AND** one of them SHALL carry the main-root mark

#### Scenario: Arrow added to Y.Doc

- **WHEN** a client adds a new entry to the `arrows` Y.Map
- **THEN** the key SHALL be `arrowKey(source, target)` of the entry
- **AND** the entry SHALL be a Y.Map containing `source` and `target`

#### Scenario: Node removal writes arrow removal in the same transaction

- **WHEN** a client removes or cuts a node whose subtree holds an endpoint of an arrow
- **THEN** the removal of the nodes and of every such arrow SHALL happen in one Y.Doc transaction

#### Scenario: Paste writes arrows in the same transaction

- **WHEN** a client pastes a subtree with inner arrows
- **THEN** the pasted nodes and their arrows SHALL be written in one Y.Doc transaction

#### Scenario: Import replaces arrows

- **WHEN** a client imports a map
- **THEN** the transaction that replaces the nodes SHALL clear the `arrows` map and write the imported arrows

#### Scenario: Redistribute keeps arrows

- **WHEN** a client redistributes the map
- **THEN** the transaction that rewrites the nodes SHALL NOT change the `arrows` map

## ADDED Requirements

### Requirement: Clients apply arrow changes from the Y.Doc

`YjsSyncService` SHALL observe the `arrows` Y.Map and apply every change written by a peer or by the local undo manager to the renderer. It SHALL skip changes from its own local writes. Applying a change SHALL be idempotent: an added key SHALL add the arrow unless the renderer holds it, and a deleted key SHALL remove the arrow if the renderer holds it. Loading a map from the Y.Doc SHALL load its arrows with its nodes. The renderer SHALL keep an arrow whose endpoint it does not hold and SHALL draw it once both endpoints exist.

#### Scenario: Remote arrow add

- **WHEN** a peer adds an entry to the `arrows` map
- **THEN** the client SHALL add the arrow to the renderer without writing to the Y.Doc

#### Scenario: Remote arrow delete

- **WHEN** a peer deletes an entry from the `arrows` map
- **THEN** the client SHALL remove the arrow from the renderer without writing to the Y.Doc

#### Scenario: Undo writes reach the renderer

- **WHEN** the local undo manager restores a node and its arrows in one transaction
- **THEN** the client SHALL draw the node and the arrows, whichever observer runs first

#### Scenario: Full-map replacement from a peer

- **WHEN** a peer imports a map
- **THEN** the client SHALL show exactly the imported nodes and arrows
