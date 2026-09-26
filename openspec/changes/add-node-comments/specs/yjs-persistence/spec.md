## MODIFIED Requirements

### Requirement: Decode Y.Doc to existing database tables

The persistence service SHALL extract node data from the Y.Doc's `nodes` Y.Map and write it to the existing MmpNode table. The persistence service SHALL extract map options from the Y.Doc's `mapOptions` Y.Map and update the existing MmpMap table. The persistence service SHALL extract comments from the Y.Doc's `comments` Y.Map and write them to the MmpComment table. The only schema change SHALL be the addition of the MmpComment table.

#### Scenario: Persist Y.Doc nodes to database

- **WHEN** persistence is triggered
- **THEN** the server SHALL read all entries from the Y.Doc `nodes` map, convert each Y.Map entry to an MmpNode entity, and write them to the database in a transaction (delete existing nodes for the map, then insert all current nodes)

#### Scenario: Persist map options to database

- **WHEN** persistence is triggered and the Y.Doc `mapOptions` map has been modified
- **THEN** the server SHALL update the MmpMap entity's options column with the current `mapOptions` values

#### Scenario: Persist comments to database

- **WHEN** persistence is triggered
- **THEN** the server SHALL, in the same transaction, delete the existing comments of the map and insert every entry of the `comments` map whose `nodeId` names an entry of the `nodes` map and that passes the `MapComment` schema
- **AND** it SHALL leave the `comments` map of the Y.Doc unchanged

#### Scenario: Comment of a removed node is not written

- **GIVEN** the `comments` map holds a comment whose node is not in the `nodes` map
- **WHEN** persistence is triggered
- **THEN** the MmpComment table SHALL hold no row for that comment
- **AND** the Y.Doc SHALL still hold it, so an undo of the removal followed by the next persist writes it again

#### Scenario: Persistence transaction atomicity

- **WHEN** a persistence transaction fails partway through (e.g., database error)
- **THEN** the entire transaction SHALL be rolled back and the server SHALL retry on the next debounce cycle

### Requirement: Hydrate Y.Doc from database

When a Y.Doc is first created for a map, the server SHALL load all MmpNode rows, all MmpComment rows and the MmpMap row from the database and populate the Y.Doc with this data.

#### Scenario: Hydrate Y.Doc for existing map

- **WHEN** the first client connects to a map that has nodes in the database
- **THEN** the server SHALL query all MmpNode rows for the map, create a Y.Map entry in the `nodes` map for each row, and populate the `mapOptions` map from the MmpMap entity

#### Scenario: Hydrate Y.Doc for empty map

- **WHEN** the first client connects to a map that has only a root node in the database
- **THEN** the server SHALL create a Y.Doc with a single entry in the `nodes` map for the root node

#### Scenario: Hydrate comments

- **WHEN** the first client connects to a map that has comments in the database
- **THEN** the server SHALL add one entry per MmpComment row to the `comments` map
