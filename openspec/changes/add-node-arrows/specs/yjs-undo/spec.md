## MODIFIED Requirements

### Requirement: Y.UndoManager lifecycle

When `yjsEnabled` is true, the `MapSyncService` SHALL create a `Y.UndoManager` instance tracking the `nodesMap` (`yDoc.getMap('nodes')`) and the `arrowsMap` (`yDoc.getMap('arrows')`). The UndoManager SHALL be configured with `trackedOrigins: new Set(['local'])`. The UndoManager SHALL be created AFTER the first Y.Doc sync and map load completes, so that the initial hydration is not captured as undoable operations. The UndoManager SHALL be destroyed in `resetYjs()` before the Y.Doc is destroyed.

#### Scenario: UndoManager created after first sync

- **WHEN** the Y.Doc completes its first sync and `loadMapFromYDoc()` finishes
- **THEN** the service SHALL create a `Y.UndoManager` on the `nodesMap` and the `arrowsMap` with `trackedOrigins: new Set(['local'])`
- **AND** the UndoManager's undo stack SHALL be empty (initial load not captured)

#### Scenario: One undo step for a node and its arrows

- **WHEN** a local transaction removes a node and the arrows attached to it
- **THEN** a single undo SHALL restore the node and the arrows

#### Scenario: UndoManager destroyed on reset

- **WHEN** `resetYjs()` is called (e.g., navigating away from a map or disconnecting)
- **THEN** the service SHALL call `yUndoManager.destroy()` before destroying the Y.Doc

#### Scenario: UndoManager not created when Yjs disabled

- **WHEN** `yjsEnabled` is false
- **THEN** the service SHALL NOT create a `Y.UndoManager` instance

### Requirement: Transaction origin on local writes

All local MMP-to-YDoc write operations SHALL use `'local'` as the transaction origin so that `Y.UndoManager` captures them. This includes arrow writes and the full-map replacement that import and redistribute write. The service SHALL call `stopCapturing()` before a full-map replacement, so that one undo reverts the replacement alone. A full-map replacement written by a peer SHALL clear the local undo stack.

#### Scenario: Node create uses tracked origin

- **WHEN** the user creates a node and the bridge writes to Y.Doc
- **THEN** the write SHALL be wrapped in `yDoc.transact(() => { ... }, 'local')`
- **AND** the UndoManager SHALL capture the operation in its undo stack

#### Scenario: Node update uses tracked origin

- **WHEN** the user updates a node property and the bridge writes to Y.Doc
- **THEN** the write SHALL be wrapped in `yDoc.transact(() => { ... }, 'local')`

#### Scenario: Node remove uses tracked origin

- **WHEN** the user removes a node and the bridge deletes from Y.Doc
- **THEN** the `yDoc.transact()` call SHALL include `'local'` as the origin

#### Scenario: Node paste uses tracked origin

- **WHEN** the user pastes nodes and the bridge writes to Y.Doc
- **THEN** the `yDoc.transact()` call SHALL include `'local'` as the origin

#### Scenario: Arrow create and remove use tracked origin

- **WHEN** the user creates or removes an arrow and the bridge writes to Y.Doc
- **THEN** the `yDoc.transact()` call SHALL include `'local'` as the origin

#### Scenario: Map options update uses tracked origin

- **WHEN** the user changes map options and the bridge writes to Y.Doc
- **THEN** the write SHALL be wrapped in `yDoc.transact(() => { ... }, 'local')`

#### Scenario: Map import is one undo step

- **GIVEN** a map with arrows
- **WHEN** the user imports a map and presses undo once
- **THEN** the map SHALL hold the nodes and arrows it held before the import

#### Scenario: Peer import clears the undo stack

- **WHEN** a peer imports a map
- **THEN** the local undo stack SHALL be empty
