## MODIFIED Requirements

### Requirement: Local MMP events write to Y.Doc
When the user performs an action in MMP (create, update, remove node), the MapSyncService bridge SHALL write the change to the local Y.Doc. The bridge SHALL NOT send individual network messages — Yjs handles synchronization automatically. All local write operations SHALL use `'local'` as the transaction origin so that `Y.UndoManager` can track them.

#### Scenario: User creates a node
- **WHEN** MMP fires a `nodeCreate` event with the new node's `ExportNodeProperties`
- **THEN** the bridge SHALL create a new Y.Map entry in `yDoc.getMap('nodes')` with the node's ID as key and all properties as values
- **AND** the write SHALL be wrapped in `yDoc.transact(() => { ... }, 'local')`

#### Scenario: User updates a node property
- **WHEN** MMP fires a `nodeUpdate` event with the updated property and value
- **THEN** the bridge SHALL update the corresponding property on the node's Y.Map entry in the `nodes` map
- **AND** the write SHALL be wrapped in `yDoc.transact(() => { ... }, 'local')`

#### Scenario: User removes a node
- **WHEN** MMP fires a `nodeRemove` event with the removed node's properties
- **THEN** the bridge SHALL delete the node's entry and all descendant entries from `yDoc.getMap('nodes')`
- **AND** the `yDoc.transact()` call SHALL use `'local'` as the origin

#### Scenario: User pastes multiple nodes
- **WHEN** MMP fires a `nodePaste` event with an array of node properties
- **THEN** the bridge SHALL add all nodes to the Y.Doc `nodes` map within a single `yDoc.transact()` call
- **AND** the `yDoc.transact()` call SHALL use `'local'` as the origin

#### Scenario: User updates map options
- **WHEN** the user changes map options (e.g., map name)
- **THEN** the bridge SHALL update the corresponding fields in `yDoc.getMap('mapOptions')`
- **AND** the write SHALL be wrapped in `yDoc.transact(() => { ... }, 'local')`

### Requirement: Echo prevention
The bridge SHALL prevent echo loops where a local MMP event writes to Y.Doc, which then triggers a Y.Doc observation that would re-apply the same change to MMP. The bridge SHALL use origin-based filtering: skip transactions that are local AND whose origin is NOT the `Y.UndoManager` instance. UndoManager-originated transactions are local but SHALL be applied to MMP because MMP was not the source of the change.

#### Scenario: Local change does not echo back
- **WHEN** the user creates a node locally (MMP event -> Y.Doc write with origin `'local'`)
- **THEN** the Y.Doc observer SHALL detect the transaction as local with origin `'local'` and SHALL NOT apply it back to MMP

#### Scenario: Remote change is applied
- **WHEN** a remote client creates a node (Y.Doc sync update received)
- **THEN** the Y.Doc observer SHALL detect the change as `transaction.local === false` and SHALL apply it to MMP

#### Scenario: UndoManager change is applied to MMP
- **WHEN** the user triggers undo/redo and `Y.UndoManager` creates a local transaction (origin = UndoManager instance)
- **THEN** the Y.Doc observer SHALL detect `transaction.origin === yUndoManager` and SHALL apply the changes to MMP
- **AND** MMP SHALL re-render the affected nodes

## REMOVED Requirements

### Requirement: Local undo/redo stays local
**Reason**: Replaced by `Y.UndoManager` in the `yjs-undo` capability. MMP's snapshot-based undo/redo is no longer used when Yjs is active. The diff-based bridge (`writeUndoRedoDiffToYDoc`) that forwarded MMP undo/redo results to Y.Doc is removed.
**Migration**: Undo/redo is now handled by `Y.UndoManager` which operates directly on Y.Doc. The toolbar routes to `MapSyncService.undo()`/`redo()` instead of `MmpService.undo()`/`redo()` when `yjsEnabled` is true.
