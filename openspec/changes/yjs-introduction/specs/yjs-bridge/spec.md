## ADDED Requirements

### Requirement: Local MMP events write to Y.Doc
When the user performs an action in MMP (create, update, remove node), the MapSyncService bridge SHALL write the change to the local Y.Doc. The bridge SHALL NOT send individual network messages — Yjs handles synchronization automatically.

#### Scenario: User creates a node
- **WHEN** MMP fires a `nodeCreate` event with the new node's `ExportNodeProperties`
- **THEN** the bridge SHALL create a new Y.Map entry in `yDoc.getMap('nodes')` with the node's ID as key and all properties as values

#### Scenario: User updates a node property
- **WHEN** MMP fires a `nodeUpdate` event with the updated property and value
- **THEN** the bridge SHALL update the corresponding property on the node's Y.Map entry in the `nodes` map

#### Scenario: User removes a node
- **WHEN** MMP fires a `nodeRemove` event with the removed node's properties
- **THEN** the bridge SHALL delete the node's entry from `yDoc.getMap('nodes')`

#### Scenario: User pastes multiple nodes
- **WHEN** MMP fires a `nodePaste` event with an array of node properties
- **THEN** the bridge SHALL add all nodes to the Y.Doc `nodes` map within a single `yDoc.transact()` call

#### Scenario: User updates map options
- **WHEN** the user changes map options (e.g., map name)
- **THEN** the bridge SHALL update the corresponding fields in `yDoc.getMap('mapOptions')`

### Requirement: Remote Y.Doc changes apply to MMP
The bridge SHALL observe the Y.Doc for remote changes and apply them to MMP using its existing API. Remote changes SHALL be applied with `notifyWithEvent: false` to prevent echo loops.

#### Scenario: Remote node added
- **WHEN** the Y.Doc `nodes` map emits an add event from a remote transaction
- **THEN** the bridge SHALL call `mmpService.addNode()` with the node properties and `notifyWithEvent: false`

#### Scenario: Remote node property updated
- **WHEN** the Y.Doc `nodes` map emits an update event for an existing node from a remote transaction
- **THEN** the bridge SHALL call `mmpService.updateNode()` with the changed property, value, `notifyWithEvent: false`, and the node ID

#### Scenario: Remote node removed
- **WHEN** the Y.Doc `nodes` map emits a delete event from a remote transaction
- **THEN** the bridge SHALL call `mmpService.removeNode()` with the node ID and `notifyWithEvent: false`, but only if the node exists in MMP

#### Scenario: Remote map options updated
- **WHEN** the Y.Doc `mapOptions` map emits a change event from a remote transaction
- **THEN** the bridge SHALL call `mmpService.updateAdditionalMapOptions()` with the updated options

### Requirement: Echo prevention
The bridge SHALL prevent echo loops where a local MMP event writes to Y.Doc, which then triggers a Y.Doc observation that would re-apply the same change to MMP. The bridge SHALL use `transaction.local` on Y.Doc observations to distinguish local from remote changes and only apply remote changes to MMP.

#### Scenario: Local change does not echo back
- **WHEN** the user creates a node locally (MMP event → Y.Doc write)
- **THEN** the Y.Doc observer SHALL detect the change as `transaction.local === true` and SHALL NOT apply it back to MMP

#### Scenario: Remote change is applied
- **WHEN** a remote client creates a node (Y.Doc sync update received)
- **THEN** the Y.Doc observer SHALL detect the change as `transaction.local === false` and SHALL apply it to MMP

### Requirement: Map import via Y.Doc transaction
When a user imports a map, the bridge SHALL clear the Y.Doc `nodes` map and repopulate it with the imported data inside a single `yDoc.transact()` call. Yjs SHALL sync the new state to all connected clients automatically.

#### Scenario: User imports a map
- **WHEN** the user triggers a map import with new map data
- **THEN** the bridge SHALL execute a Y.Doc transaction that deletes all entries from the `nodes` map and adds all imported nodes as new entries
- **AND** all connected clients SHALL receive the Y.Doc update and re-render via their bridge observers

### Requirement: Map deletion handling
When a map is deleted via the REST API, the server SHALL destroy the Y.Doc and close all WebSocket connections for that map. The frontend SHALL detect the WebSocket close and handle cleanup.

#### Scenario: Admin deletes a map
- **WHEN** the admin calls the map deletion REST endpoint
- **THEN** the server SHALL destroy the in-memory Y.Doc for that map and close all associated WebSocket connections

#### Scenario: Client detects map deletion
- **WHEN** the client's WebSocket connection is closed by the server due to map deletion
- **THEN** the frontend SHALL handle the disconnection (e.g., redirect to home or show a notification)

### Requirement: Initial map load via Y.Doc
When a user opens a map, the frontend SHALL receive the map state through the Yjs sync protocol instead of a Socket.io `join` response. After the Y.Doc syncs, the bridge SHALL extract all nodes and initialize MMP.

#### Scenario: User opens an existing map
- **WHEN** the WebsocketProvider connects and the Y.Doc syncs with the server
- **THEN** the bridge SHALL read all entries from the `nodes` map, convert them to `ExportNodeProperties[]`, and call `mmpService.new(snapshot)` to initialize the map

### Requirement: Local undo/redo stays local
MMP's existing undo/redo (snapshot-based history) SHALL continue to function for local changes. Undo/redo diffs SHALL NOT be broadcast to other clients. Other clients will see the result of the undo/redo as normal Y.Doc changes.

#### Scenario: User performs undo
- **WHEN** the user triggers undo in MMP
- **THEN** MMP SHALL redraw from its history snapshot and the bridge SHALL write the resulting node changes to the Y.Doc (adds, updates, deletes from the undo diff)
- **AND** other clients SHALL receive these as normal node changes, not as an undo operation

#### Scenario: User performs redo
- **WHEN** the user triggers redo in MMP
- **THEN** MMP SHALL redraw from its history snapshot and the bridge SHALL write the resulting node changes to the Y.Doc
- **AND** other clients SHALL receive these as normal node changes, not as a redo operation
