## MODIFIED Requirements

### Requirement: Client presence via Yjs Awareness

Each connected client SHALL announce its presence using the Yjs Awareness protocol. The awareness state SHALL include the client's assigned color, current node selection and normalized display name, where the empty string means no display name. The awareness state SHALL be set when the client connects and updated when the selection or the display name changes. Every update SHALL write all three fields.

#### Scenario: Client sets initial awareness state on connect

- **WHEN** a client connects to a map via the WebsocketProvider
- **THEN** the client SHALL set its awareness state with `{ color: <assigned-color>, selectedNodeId: null, displayName: <display-name> }`

#### Scenario: Client updates awareness on node selection

- **WHEN** a user selects a node in the map
- **THEN** the client SHALL update its awareness state to `{ color: <color>, selectedNodeId: <node-id>, displayName: <display-name> }`

#### Scenario: Client updates awareness on node deselection

- **WHEN** a user deselects a node
- **THEN** the client SHALL update its awareness state to `{ color: <color>, selectedNodeId: null, displayName: <display-name> }`

#### Scenario: Client updates awareness on display name change

- **GIVEN** a client is connected and has node "node-1" selected
- **WHEN** the user changes the display name
- **THEN** the client SHALL update its awareness state with the new display name
- **AND** the color and `selectedNodeId: "node-1"` SHALL be unchanged
- **AND** the client SHALL stay connected

#### Scenario: Remote client of an older version

- **WHEN** a remote client's awareness state has no `displayName`
- **THEN** the local client SHALL treat it as a client without a display name

### Requirement: Client list derived from awareness states

The frontend SHALL derive the list of connected clients from `awareness.getStates()`. Each entry SHALL hold the client id, the client color, the normalized display name and whether it is the local client. There SHALL be no separate server-side client tracking (the `cache-manager` client cache is removed).

#### Scenario: New client appears in the list

- **WHEN** a new client connects and sets its awareness state
- **THEN** all other clients SHALL receive an awareness change event and update their client list to include the new client's color and display name

#### Scenario: Client disconnects and disappears from list

- **WHEN** a client disconnects
- **THEN** the Yjs Awareness protocol SHALL automatically remove the client's state and all other clients SHALL receive a change event to update their client list

#### Scenario: Remote client renames

- **WHEN** a remote client changes its display name
- **THEN** all other clients SHALL update that client's entry in their client list without a reconnect

#### Scenario: Two clients share a color

- **WHEN** two clients announce the same color
- **THEN** the client list SHALL hold one entry for each of them
