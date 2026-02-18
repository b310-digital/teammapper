## ADDED Requirements

### Requirement: Y.UndoManager lifecycle
When `yjsEnabled` is true, the `MapSyncService` SHALL create a `Y.UndoManager` instance tracking the `nodesMap` (`yDoc.getMap('nodes')`). The UndoManager SHALL be configured with `trackedOrigins: new Set(['local'])`. The UndoManager SHALL be created AFTER the first Y.Doc sync and map load completes, so that the initial hydration is not captured as undoable operations. The UndoManager SHALL be destroyed in `resetYjs()` before the Y.Doc is destroyed.

#### Scenario: UndoManager created after first sync
- **WHEN** the Y.Doc completes its first sync and `loadMapFromYDoc()` finishes
- **THEN** the service SHALL create a `Y.UndoManager` on the `nodesMap` with `trackedOrigins: new Set(['local'])`
- **AND** the UndoManager's undo stack SHALL be empty (initial load not captured)

#### Scenario: UndoManager destroyed on reset
- **WHEN** `resetYjs()` is called (e.g., navigating away from a map or disconnecting)
- **THEN** the service SHALL call `yUndoManager.destroy()` before destroying the Y.Doc

#### Scenario: UndoManager not created when Yjs disabled
- **WHEN** `yjsEnabled` is false
- **THEN** the service SHALL NOT create a `Y.UndoManager` instance

### Requirement: Transaction origin on local writes
All local MMP-to-YDoc write operations SHALL use `'local'` as the transaction origin so that `Y.UndoManager` captures them. Import operations SHALL use a separate origin (`'import'`) that is NOT tracked by the UndoManager.

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

#### Scenario: Map options update uses tracked origin
- **WHEN** the user changes map options and the bridge writes to Y.Doc
- **THEN** the write SHALL be wrapped in `yDoc.transact(() => { ... }, 'local')`

#### Scenario: Map import uses untracked origin
- **WHEN** the user imports a map and the bridge writes to Y.Doc
- **THEN** the `yDoc.transact()` call SHALL use `'import'` as the origin
- **AND** the UndoManager SHALL NOT capture the import operation

### Requirement: Undo and redo via Y.UndoManager
When `yjsEnabled` is true, the `MapSyncService` SHALL expose public `undo()` and `redo()` methods that delegate to `Y.UndoManager.undo()` and `Y.UndoManager.redo()` respectively. MMP's `History.undo()` and `History.redo()` SHALL NOT be called when Yjs is active.

#### Scenario: User triggers undo with Yjs active
- **WHEN** the user presses the undo button and `yjsEnabled` is true
- **THEN** `mapSyncService.undo()` SHALL be called
- **AND** `Y.UndoManager.undo()` SHALL reverse the user's last tracked Y.Doc change
- **AND** `mmpService.undo()` SHALL NOT be called

#### Scenario: User triggers redo with Yjs active
- **WHEN** the user presses the redo button and `yjsEnabled` is true
- **THEN** `mapSyncService.redo()` SHALL be called
- **AND** `Y.UndoManager.redo()` SHALL reapply the user's last undone change
- **AND** `mmpService.redo()` SHALL NOT be called

#### Scenario: Per-user undo isolation
- **WHEN** User A and User B both edit nodes, and User A presses undo
- **THEN** only User A's last change SHALL be reversed
- **AND** User B's changes SHALL remain intact

#### Scenario: Undo when stack is empty
- **WHEN** the user presses undo but the UndoManager's undo stack is empty
- **THEN** the `undo()` call SHALL be a no-op (Y.UndoManager handles this gracefully)

### Requirement: Full property fidelity on undo/redo of delete
When a node (or subtree) is deleted and the deletion is undone, ALL node properties stored in Y.Doc SHALL be restored exactly — including coordinates, colors, font, image, link, parent reference, k value, locked state, and detached state. The redo of such an undo (re-delete) and subsequent undo (re-restore) SHALL also preserve full property fidelity.

#### Scenario: Undo of single node delete restores all properties
- **GIVEN** a node exists with `coordinates: {x: 200, y: -120}`, `colors: {name: '#000', background: '#fff', branch: '#333'}`, and `k: -1`
- **WHEN** the node is deleted and the user triggers undo
- **THEN** the Y.Doc SHALL contain the restored node with ALL original properties intact
- **AND** `coordinates` SHALL be `{x: 200, y: -120}` (not recalculated)
- **AND** `k` SHALL be `-1` (preserving left/right orientation)

#### Scenario: Undo of subtree delete restores parent and all descendants
- **GIVEN** node `A` has child `B`, and `B` has child `C`
- **AND** all three nodes have distinct coordinates and properties
- **WHEN** `A` is deleted (which cascades to `B` and `C` in a single transaction)
- **AND** the user triggers undo
- **THEN** the Y.Doc SHALL contain all three nodes with their original properties
- **AND** `B.parent` SHALL be `A.id` and `C.parent` SHALL be `B.id`

#### Scenario: Multiple undo/redo cycles preserve properties
- **GIVEN** a node exists with specific coordinates and properties
- **WHEN** the node is deleted, then undo, then redo (re-delete), then undo (re-restore)
- **THEN** after the final undo, the node's properties in Y.Doc SHALL match the original values exactly

### Requirement: Reactive canUndo and canRedo state
The `MapSyncService` SHALL expose `canUndo$` and `canRedo$` as `Observable<boolean>` so the toolbar can reactively enable/disable undo/redo buttons when Yjs is active.

#### Scenario: canUndo updates after user edit
- **WHEN** the user makes an edit that is captured by the UndoManager
- **THEN** `canUndo$` SHALL emit `true`

#### Scenario: canUndo updates after undo empties stack
- **WHEN** the user undoes all operations and the undo stack becomes empty
- **THEN** `canUndo$` SHALL emit `false`

#### Scenario: canRedo updates after undo
- **WHEN** the user performs an undo
- **THEN** `canRedo$` SHALL emit `true`

#### Scenario: canRedo resets after new edit
- **WHEN** the user makes a new edit after undoing (clearing the redo stack)
- **THEN** `canRedo$` SHALL emit `false`

### Requirement: Toolbar conditional routing
The toolbar SHALL route undo/redo actions based on `yjsEnabled`. When `yjsEnabled` is true, the toolbar SHALL call `mapSyncService.undo()`/`redo()` and use `canUndo$`/`canRedo$` for button state. When `yjsEnabled` is false, the toolbar SHALL continue calling `mmpService.undo()`/`redo()` and checking `mmpService.history()` for button state.

#### Scenario: Toolbar undo with Yjs active
- **WHEN** the user clicks the undo button and `yjsEnabled` is true
- **THEN** the toolbar SHALL call `mapSyncService.undo()`

#### Scenario: Toolbar undo with Yjs inactive
- **WHEN** the user clicks the undo button and `yjsEnabled` is false
- **THEN** the toolbar SHALL call `mmpService.undo()`

#### Scenario: Toolbar button state with Yjs active
- **WHEN** `yjsEnabled` is true
- **THEN** the undo button's disabled state SHALL be derived from `canUndo$` (disabled when false)
- **AND** the redo button's disabled state SHALL be derived from `canRedo$` (disabled when false)

#### Scenario: Toolbar button state with Yjs inactive
- **WHEN** `yjsEnabled` is false
- **THEN** the undo/redo button disabled state SHALL continue using `mmpService.history().snapshots.length > 1`

### Requirement: Removal of diff-based undo bridge
When `yjsEnabled` is true, the `MapSyncService` SHALL NOT subscribe to MMP's `undo` and `redo` events. The `setupYjsUndoRedoHandlers()` method and `writeUndoRedoDiffToYDoc()` method (and its helpers) SHALL be removed.

#### Scenario: MMP undo event not subscribed in Yjs path
- **WHEN** `yjsEnabled` is true and the Yjs bridge is initialized
- **THEN** the service SHALL NOT subscribe to `mmpService.on('undo')` or `mmpService.on('redo')`

#### Scenario: Diff-based write methods removed
- **WHEN** the codebase is updated
- **THEN** `writeUndoRedoDiffToYDoc`, `writeAddedNodesToYDoc`, `writeUpdatedNodesToYDoc`, and `writeDeletedNodesFromYDoc` SHALL no longer exist in `MapSyncService`
