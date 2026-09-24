## ADDED Requirements

### Requirement: The Y.Doc carries node images as references or data URLs
The `image` field of a node entry in the `nodes` Y.Map SHALL hold an `image:<uuid>` reference, a data URL, or no image. A current frontend SHALL write a reference for every image it adds. A client joining a map whose nodes all reference their images SHALL receive no image bytes in the Yjs sync.

#### Scenario: Map with references syncs without image bytes
- **GIVEN** every node image of a map is a reference
- **WHEN** a client connects to the map
- **THEN** the Yjs sync SHALL carry the references
- **AND** the Yjs sync SHALL carry no image bytes

#### Scenario: Data URL written by an older client
- **WHEN** an older cached frontend writes a data URL into a node's `image` field
- **THEN** every connected client SHALL render the image
- **AND** the `image` field SHALL keep the data URL
