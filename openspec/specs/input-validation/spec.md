## ADDED Requirements

### Requirement: The system SHALL validate map creation requests
When a user creates a new map, the system SHALL verify that the request contains a valid root node with expected fields (name, colors, font, image). Malformed or missing data SHALL be rejected with a clear error.

#### Scenario: Valid map creation accepted
- **WHEN** a user creates a map with a valid root node
- **THEN** the system SHALL accept the request and create the map

#### Scenario: Missing root node rejected
- **WHEN** a user creates a map without providing a root node
- **THEN** the system SHALL reject the request with a validation error

#### Scenario: Oversized root node name rejected
- **WHEN** a user creates a map with a root node name exceeding 500 characters
- **THEN** the system SHALL reject the request with a validation error

#### Scenario: Invalid root node data rejected
- **WHEN** a user creates a map with malformed root node data (e.g. a number where text is expected)
- **THEN** the system SHALL reject the request with a validation error

### Requirement: The system SHALL validate map deletion requests
When a user deletes a map, the system SHALL verify that the request identifies a valid map. Incomplete requests SHALL be rejected with a clear error.

#### Scenario: Valid deletion accepted
- **WHEN** a user deletes a map with valid identification
- **THEN** the system SHALL accept the request

#### Scenario: Missing map identifier rejected
- **WHEN** a user sends a deletion request without identifying which map to delete
- **THEN** the system SHALL reject the request with a validation error

### Requirement: The system SHALL validate all real-time collaboration messages
When a user sends messages during real-time collaboration (joining a session, selecting nodes, editing nodes, updating map options), the system SHALL verify that each message has the expected structure. Malformed messages SHALL be rejected with a clear error sent back to the user.

#### Scenario: Valid join accepted
- **WHEN** a user joins a collaboration session with valid session and display information
- **THEN** the system SHALL accept the join

#### Scenario: Invalid join rejected
- **WHEN** a user joins a collaboration session without identifying which map to join
- **THEN** the system SHALL reject the join with a validation error

#### Scenario: Valid node edit accepted
- **WHEN** a user sends a node update with valid node data and authorization
- **THEN** the system SHALL process the update

#### Scenario: Malformed node edit rejected
- **WHEN** a user sends a node update with structurally invalid node data (e.g. missing node ID, wrong data types)
- **THEN** the system SHALL reject the update with a validation error

#### Scenario: Invalid node selection rejected
- **WHEN** a user sends a node selection message with invalid data types
- **THEN** the system SHALL reject the message with a validation error

### Requirement: The system SHALL enforce size limits on node content
Node names SHALL have a maximum length of 5000 characters across all entry points (map creation, node addition, node editing). This prevents abuse and ensures consistent behavior.

#### Scenario: Normal node name accepted
- **WHEN** a user creates or edits a node with a 2000-character name
- **THEN** the system SHALL accept it

#### Scenario: Oversized node name rejected
- **WHEN** a user creates or edits a node with a name exceeding 5000 characters
- **THEN** the system SHALL reject it with a validation error
