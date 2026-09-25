# yjs-persistence Specification

## Purpose

Defines how the server loads a map from PostgreSQL into its Y.Doc and writes the Y.Doc state back to the database.

## Requirements

### Requirement: Debounced persistence on Y.Doc change
The server SHALL persist the Y.Doc state to PostgreSQL on a debounced timer. When a Y.Doc is modified, the server SHALL wait for a configurable debounce interval (default 2 seconds) of inactivity before persisting. Each new modification SHALL reset the debounce timer.

#### Scenario: Single edit triggers persistence
- **WHEN** a client makes a change to the Y.Doc and no further changes occur within the debounce interval
- **THEN** the server SHALL persist the Y.Doc state to the database after the debounce interval elapses

#### Scenario: Rapid edits coalesce into one persist
- **WHEN** a client makes multiple changes within the debounce interval
- **THEN** the server SHALL persist only once after the debounce interval elapses from the last change

#### Scenario: Persistence on last client disconnect
- **WHEN** the last client disconnects from a map
- **THEN** the server SHALL immediately persist the Y.Doc state to the database regardless of the debounce timer

### Requirement: Decode Y.Doc to existing database tables
The persistence service SHALL extract node data from the Y.Doc's `nodes` Y.Map and write it to the existing MmpNode table. The persistence service SHALL extract map options from the Y.Doc's `mapOptions` Y.Map and update the existing MmpMap table. The database schema SHALL NOT be modified.

#### Scenario: Persist Y.Doc nodes to database
- **WHEN** persistence is triggered
- **THEN** the server SHALL read all entries from the Y.Doc `nodes` map, convert each Y.Map entry to an MmpNode entity, and write them to the database in a transaction (delete existing nodes for the map, then insert all current nodes)

#### Scenario: Persist map options to database
- **WHEN** persistence is triggered and the Y.Doc `mapOptions` map has been modified
- **THEN** the server SHALL update the MmpMap entity's options column with the current `mapOptions` values

#### Scenario: Persistence transaction atomicity
- **WHEN** a persistence transaction fails partway through (e.g., database error)
- **THEN** the entire transaction SHALL be rolled back and the server SHALL retry on the next debounce cycle

### Requirement: Hydrate Y.Doc from database
When a Y.Doc is first created for a map, the server SHALL load all MmpNode rows and the MmpMap row from the database and populate the Y.Doc with this data.

#### Scenario: Hydrate Y.Doc for existing map
- **WHEN** the first client connects to a map that has nodes in the database
- **THEN** the server SHALL query all MmpNode rows for the map, create a Y.Map entry in the `nodes` map for each row, and populate the `mapOptions` map from the MmpMap entity

#### Scenario: Hydrate Y.Doc for empty map
- **WHEN** the first client connects to a map that has only a root node in the database
- **THEN** the server SHALL create a Y.Doc with a single entry in the `nodes` map for the root node

### Requirement: Update lastModified timestamps on persist
The persistence service SHALL update the MmpMap `lastModified` timestamp and each MmpNode `lastModified` timestamp when persisting Y.Doc state to the database.

#### Scenario: Map timestamp updated on persist
- **WHEN** the Y.Doc is persisted to the database
- **THEN** the MmpMap's `lastModified` column SHALL be set to the current time

### Requirement: REST API reads from database
The REST API (MapsController) SHALL continue to read map and node data directly from PostgreSQL. The REST API SHALL NOT read from in-memory Y.Docs. This means REST API responses may lag behind real-time Y.Doc state by up to the debounce interval.

#### Scenario: REST API returns persisted state
- **WHEN** a client calls `GET /api/maps/:id`
- **THEN** the server SHALL return data from the database, which reflects the last persisted Y.Doc state

### Requirement: Node images are stored outside the node table
The server SHALL keep referenced images outside the node table, keyed by map id and image id, and SHALL delete them together with their map. A node row SHALL hold its image as given: a reference, a data URL, or no image.

#### Scenario: Map deletion removes its images
- **WHEN** a map is deleted
- **THEN** no image of that map SHALL remain readable

### Requirement: Persist and hydration keep node images as given
Persisting a Y.Doc and hydrating a Y.Doc SHALL copy each node image between the Y.Doc and the node row unchanged. Neither SHALL convert a data URL to a reference, and neither SHALL write or delete image rows.

#### Scenario: Map saved with data URLs
- **GIVEN** a map whose node rows hold data URLs
- **WHEN** a client opens the map, edits a node name, and persistence runs
- **THEN** the Y.Doc and the node rows SHALL still hold the data URLs
- **AND** every node SHALL display its image

#### Scenario: Map with references
- **GIVEN** a map whose nodes reference images
- **WHEN** persistence runs and the server later hydrates the map again
- **THEN** the Y.Doc SHALL hold the same references
