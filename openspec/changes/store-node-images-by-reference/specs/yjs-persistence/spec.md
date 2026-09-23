## ADDED Requirements

### Requirement: Node images are stored outside the node table
The server SHALL keep referenced images outside the node table, keyed by map id and hash, and SHALL delete them together with their map. A node row SHALL hold its image as given: a reference, a data URL, or no image.

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
