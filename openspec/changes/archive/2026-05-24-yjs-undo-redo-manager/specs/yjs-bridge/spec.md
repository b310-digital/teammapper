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

### Requirement: Coordinate preservation on node restore
When the Y.Doc observer applies a node-add to MMP (from undo/redo or remote sync), and the node's Y.Map contains non-zero coordinates, the bridge SHALL ensure those coordinates are used as the node's position. The MMP layer SHALL NOT recalculate positions for nodes that already have stored coordinates from Y.Doc.

**Bug reference:** `nodes.ts:124` unconditionally calls `calculateCoordinates(node)`, overwriting the coordinates passed in from Y.Doc with freshly calculated positions. This causes restored nodes to appear at "append to bottom of siblings" positions rather than their original locations.

#### Scenario: Undo of delete preserves original coordinates
- **WHEN** a node at coordinates `{x: 200, y: -120}` is deleted and the user triggers undo
- **AND** the Y.UndoManager restores the node to Y.Doc with its original coordinates
- **THEN** the bridge SHALL pass the coordinates from Y.Doc to MMP
- **AND** MMP SHALL render the node at `{x: 200, y: -120}`, NOT at a recalculated position

#### Scenario: Undo of subtree delete preserves all node coordinates
- **WHEN** a parent node with descendants is deleted (single transaction) and the user triggers undo
- **THEN** ALL restored nodes (parent and descendants) SHALL retain their original coordinates from Y.Doc
- **AND** no node SHALL be repositioned by `calculateCoordinates()`

#### Scenario: Remote node-add with coordinates preserves position
- **WHEN** a remote client creates a node with specific coordinates
- **AND** the Y.Doc sync delivers the node with those coordinates
- **THEN** the bridge SHALL apply the node to MMP at the coordinates from Y.Doc

### Requirement: Parent-first ordering on batch node restore
When a Y.Doc transaction adds multiple nodes (e.g., undo of a subtree delete), the observer SHALL process parent nodes before their children. This ensures that when `addNode()` is called for a child, the parent already exists in MMP's node map and can be resolved.

**Bug reference:** `keysChanged.forEach` in `handleTopLevelNodeChanges` (`map-sync.service.ts:1557`) iterates in Y.Map internal order, which may not be parent-first. A child node processed before its parent causes `getNode(parentId)` to return `undefined`, corrupting the parent reference and position.

#### Scenario: Subtree restore processes parent before children
- **GIVEN** a parent node `A` with child `B` and grandchild `C` were deleted in one transaction
- **WHEN** the user triggers undo and all three nodes are restored in one transaction
- **THEN** the observer SHALL add `A` to MMP before `B`, and `B` before `C`
- **AND** each child SHALL have a valid parent reference in MMP at the time of insertion

#### Scenario: Flat siblings restored in any order
- **GIVEN** two sibling nodes `B` and `C` (both children of `A`) were deleted
- **WHEN** the undo restores them
- **THEN** `A` SHALL be added first (parent-first), but `B` and `C` MAY be added in any order relative to each other

## REMOVED Requirements

### Requirement: Local undo/redo stays local
**Reason**: Replaced by `Y.UndoManager` in the `yjs-undo` capability. MMP's snapshot-based undo/redo is no longer used when Yjs is active. The diff-based bridge (`writeUndoRedoDiffToYDoc`) that forwarded MMP undo/redo results to Y.Doc is removed.
**Migration**: Undo/redo is now handled by `Y.UndoManager` which operates directly on Y.Doc. The toolbar routes to `MapSyncService.undo()`/`redo()` instead of `MmpService.undo()`/`redo()` when `yjsEnabled` is true.
