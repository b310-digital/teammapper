## MODIFIED Requirements

### Requirement: Decode Y.Doc to existing database tables

The persistence service SHALL extract node data from the Y.Doc's `nodes` Y.Map and write it to the MmpNode table. The persistence service SHALL extract arrow data from the Y.Doc's `arrows` Y.Map and write it to the MmpArrow table. The persistence service SHALL extract map options from the Y.Doc's `mapOptions` Y.Map and update the existing MmpMap table. The persistence service SHALL leave out every arrow whose source or target is not among the nodes being written, which excludes every node no root reaches, and every entry whose key is not the arrow key of its own source and target. The persistence service SHALL NOT change the Y.Doc.

#### Scenario: Persist Y.Doc nodes to database

- **WHEN** persistence is triggered
- **THEN** the server SHALL read all entries from the Y.Doc `nodes` map, convert each Y.Map entry to an MmpNode entity, and write them to the database in a transaction (delete the nodes of the map that the Y.Doc no longer holds, then upsert all current nodes)

#### Scenario: Persist Y.Doc arrows to database

- **WHEN** persistence is triggered
- **THEN** after the nodes and in the same transaction, the server SHALL delete every MmpArrow row of the map and insert every arrow of the Y.Doc `arrows` map that it does not leave out

#### Scenario: Repeated save of an unchanged arrow

- **GIVEN** a map with an arrow between two nodes has been persisted
- **WHEN** persistence is triggered again with both nodes and the arrow still in the Y.Doc
- **THEN** the transaction SHALL commit
- **AND** the database SHALL hold the arrow once

#### Scenario: Arrow removed between surviving nodes

- **GIVEN** a persisted arrow from A to B
- **WHEN** a client removes the arrow and keeps A and B, and persistence is triggered
- **THEN** no MmpArrow row from A to B SHALL remain

#### Scenario: Dangling arrow is left out

- **WHEN** the `arrows` map holds an arrow whose target is not in the `nodes` map
- **THEN** the server SHALL persist every node and every other arrow
- **AND** the server SHALL log the key of the arrow it left out at debug level
- **AND** the arrow SHALL remain in the Y.Doc

#### Scenario: Persist map options to database

- **WHEN** persistence is triggered and the Y.Doc `mapOptions` map has been modified
- **THEN** the server SHALL update the MmpMap entity's options column with the current `mapOptions` values

#### Scenario: Persistence transaction atomicity

- **WHEN** a persistence transaction fails partway through (e.g., database error)
- **THEN** the entire transaction SHALL be rolled back and the server SHALL retry on the next debounce cycle

### Requirement: Hydrate Y.Doc from database

When a Y.Doc is first created for a map, the server SHALL load all MmpNode rows, all MmpArrow rows and the MmpMap row from the database and populate the Y.Doc with this data.

#### Scenario: Hydrate Y.Doc for existing map

- **WHEN** the first client connects to a map that has nodes in the database
- **THEN** the server SHALL query all MmpNode and MmpArrow rows for the map, create a Y.Map entry in the `nodes` map for each node row and in the `arrows` map for each arrow row, and populate the `mapOptions` map from the MmpMap entity

#### Scenario: Hydrate Y.Doc for empty map

- **WHEN** the first client connects to a map that has only a root node in the database
- **THEN** the server SHALL create a Y.Doc with a single entry in the `nodes` map for the root node and an empty `arrows` map

#### Scenario: Hydration drops a dangling arrow

- **GIVEN** the Y.Doc of a map held a dangling arrow when the server unloaded it
- **WHEN** a client connects and the server hydrates the map again
- **THEN** the `arrows` map SHALL NOT hold that arrow

### Requirement: REST API reads from database

The REST API (MapsController) SHALL continue to read map, node and arrow data directly from PostgreSQL. The REST API SHALL NOT read from in-memory Y.Docs. This means REST API responses may lag behind real-time Y.Doc state by up to the debounce interval. Every response that returns a `ClientMap` SHALL include the map's arrows.

#### Scenario: REST API returns persisted state

- **WHEN** a client calls `GET /api/maps/:id`
- **THEN** the server SHALL return data from the database, which reflects the last persisted Y.Doc state
- **AND** the response SHALL hold the persisted arrows beside the nodes

## ADDED Requirements

### Requirement: Arrows are stored with referential integrity

The MmpArrow table SHALL use `(nodeMapId, sourceNodeId, targetNodeId)` as its primary key and SHALL reference its source and target through composite foreign keys to `mmp_node (nodeMapId, id)` that cascade on delete.

#### Scenario: Deleting a node deletes its arrows

- **WHEN** a MmpNode row is deleted
- **THEN** no MmpArrow row naming it as source or target SHALL remain

#### Scenario: Deleting a map deletes its arrows

- **WHEN** a map is deleted
- **THEN** no MmpArrow row of that map SHALL remain

### Requirement: Map-wide writes carry arrows

Duplicating a map SHALL copy its arrow rows with the new map id and unchanged node ids, after the nodes. `MapsService.updateMap` SHALL insert the arrows of the given `ClientMap` after its nodes.

#### Scenario: Duplicate a map with arrows

- **GIVEN** a map with an arrow from A to B
- **WHEN** the user duplicates the map
- **THEN** the new map SHALL hold an arrow from A to B, with the same node ids as the original
- **AND** the duplicate response SHALL include the arrow

#### Scenario: Seed rewrite

- **GIVEN** a map with arrows
- **WHEN** the seed job rewrites it through `updateMap` with a `ClientMap` holding no arrows
- **THEN** the map SHALL hold the new nodes and no arrows
