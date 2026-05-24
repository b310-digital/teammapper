## ADDED Requirements

### Requirement: Client presence via Yjs Awareness
Each connected client SHALL announce its presence using the Yjs Awareness protocol. The awareness state SHALL include the client's assigned color and current node selection. The awareness state SHALL be set when the client connects and updated when the selection changes.

#### Scenario: Client sets initial awareness state on connect
- **WHEN** a client connects to a map via the WebsocketProvider
- **THEN** the client SHALL set its awareness state with `{ color: <assigned-color>, selectedNodeId: null }`

#### Scenario: Client updates awareness on node selection
- **WHEN** a user selects a node in the map
- **THEN** the client SHALL update its awareness state to `{ color: <color>, selectedNodeId: <node-id> }`

#### Scenario: Client updates awareness on node deselection
- **WHEN** a user deselects a node
- **THEN** the client SHALL update its awareness state to `{ color: <color>, selectedNodeId: null }`

### Requirement: Client color assignment
Each client SHALL be assigned a random color from the existing `COLORS` palette on connection. If the chosen color collides with another connected client's color (detected via awareness states), a random fallback color SHALL be generated.

#### Scenario: Client picks a unique color
- **WHEN** a client connects and its randomly chosen color is not used by any other client
- **THEN** the client SHALL use that color in its awareness state

#### Scenario: Client color collision
- **WHEN** a client connects and its randomly chosen color matches another client's awareness color
- **THEN** the client SHALL generate a random hex color as a fallback

### Requirement: Client list derived from awareness states
The frontend SHALL derive the list of connected clients and their colors from `awareness.getStates()`. There SHALL be no separate server-side client tracking (the `cache-manager` client cache is removed).

#### Scenario: New client appears in the list
- **WHEN** a new client connects and sets its awareness state
- **THEN** all other clients SHALL receive an awareness change event and update their client list to include the new client's color

#### Scenario: Client disconnects and disappears from list
- **WHEN** a client disconnects
- **THEN** the Yjs Awareness protocol SHALL automatically remove the client's state and all other clients SHALL receive a change event to update their client list

### Requirement: Node selection highlighting from awareness
The frontend SHALL observe awareness state changes and highlight nodes that other clients have selected. When a remote client's `selectedNodeId` changes, the local client SHALL call MMP's `highlightNode` method with the remote client's color.

#### Scenario: Remote client selects a node
- **WHEN** a remote client's awareness state changes to `{ selectedNodeId: "node-1" }`
- **THEN** the local client SHALL highlight "node-1" with the remote client's color via `mmpService.highlightNode()`

#### Scenario: Remote client deselects a node
- **WHEN** a remote client's awareness state changes from `{ selectedNodeId: "node-1" }` to `{ selectedNodeId: null }`
- **THEN** the local client SHALL remove the highlight from "node-1" (or apply the next client's color if another client still has it selected)

#### Scenario: Remote client selects a node that no longer exists locally
- **WHEN** a remote client's awareness state references a node ID that does not exist in the local MMP instance
- **THEN** the local client SHALL ignore the highlight update without error

### Requirement: Connection status from WebSocket provider
The frontend SHALL derive the connection status (`connected` / `disconnected`) from the `WebsocketProvider`'s connection state, replacing the previous Socket.io-based connection tracking.

#### Scenario: Connection established
- **WHEN** the WebsocketProvider successfully connects
- **THEN** the connection status observable SHALL emit `'connected'`

#### Scenario: Connection lost
- **WHEN** the WebSocket connection is interrupted
- **THEN** the connection status observable SHALL emit `'disconnected'`
