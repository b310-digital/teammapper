# yjs-undo Specification

## Purpose

Defines undo and redo through a Y.UndoManager that tracks only the local changes of a client and restores every node property.

## Requirements

### Requirement: Y.UndoManager lifecycle
`YjsSyncService` SHALL create one `Y.UndoManager` over the `nodes` map (`yDoc.getMap('nodes')`) with `trackedOrigins: new Set([LOCAL_ORIGIN])`. `YjsSyncService` SHALL create it in `attachMap`, after the first sync and after mmp exists. Opening a map writes nothing to the Y.Doc, so the undo stack SHALL start empty. `YjsSyncService.destroy()` SHALL destroy the undo manager before it destroys the Y.Doc, and SHALL reset `canUndo$` and `canRedo$` to `false`.

#### Scenario: UndoManager created after first sync
- **WHEN** the Y.Doc completes its first sync and `attachMap` runs
- **THEN** the service SHALL create a `Y.UndoManager` on the `nodes` map with `trackedOrigins: new Set([LOCAL_ORIGIN])`
- **AND** the undo stack SHALL be empty

#### Scenario: UndoManager destroyed on teardown
- **WHEN** `destroy()` runs, such as when the user leaves the map or the server resets the map sync
- **THEN** the service SHALL call `yUndoManager.destroy()` before destroying the Y.Doc

### Requirement: Only local node writes are undoable
Every write of `YjsMapData` SHALL carry `LOCAL_ORIGIN`, so the undo manager captures it. A peer's change arrives with the WebsocketProvider as its origin, so the undo manager SHALL NOT capture it. The undo manager tracks the `nodes` map only, so a change of the map settings in the `mapOptions` map SHALL NOT be undoable.

#### Scenario: Node write is captured
- **WHEN** the user adds, updates, removes or pastes nodes
- **THEN** the write SHALL run in a transaction with origin `LOCAL_ORIGIN`
- **AND** the undo manager SHALL capture it in its undo stack

#### Scenario: Peer write is not captured
- **WHEN** a peer's update changes the `nodes` map
- **THEN** the undo manager SHALL NOT add a stack item for it

#### Scenario: Map settings change is not captured
- **WHEN** the user changes a font size setting
- **THEN** the undo stack SHALL stay unchanged

### Requirement: Import and batch take their own undo step
`YjsMapData.replaceMap` and `YjsMapData.batch` SHALL call `stopCapturing()` on the undo manager before and after their transaction, so the edits before and after them never join their undo step. An undo of an import SHALL restore the map the import replaced.

#### Scenario: Undo an import
- **GIVEN** the user edited a node and then imported a map
- **WHEN** the user triggers undo once
- **THEN** the map SHALL show the nodes from before the import, including the edited node
- **AND** a second undo SHALL revert the node edit

#### Scenario: Undo a paste
- **WHEN** the user pastes several nodes and triggers undo
- **THEN** one undo SHALL remove all pasted nodes

### Requirement: A peer's replacement clears the undo stack
When a peer's transaction replaces the main root, as an import or the undo of one does, the frontend SHALL clear the undo stack. The local history then describes a map that no longer exists.

#### Scenario: Peer imports a map
- **GIVEN** the user has edits in the undo stack
- **WHEN** a peer imports a map
- **THEN** the undo and redo stacks SHALL be empty
- **AND** `canUndo$` and `canRedo$` SHALL emit `false`

### Requirement: Undo and redo via Y.UndoManager
`MapSyncService` SHALL expose public `undo()` and `redo()` methods. They SHALL delegate through `YjsSyncService` to `Y.UndoManager.undo()` and `Y.UndoManager.redo()`. The undone or redone change SHALL reach mmp through the map data, as every other change does.

#### Scenario: User triggers undo
- **WHEN** the user presses the undo button
- **THEN** `Y.UndoManager.undo()` SHALL reverse the user's last tracked change
- **AND** mmp SHALL redraw the nodes the change touches

#### Scenario: User triggers redo
- **WHEN** the user presses the redo button
- **THEN** `Y.UndoManager.redo()` SHALL reapply the user's last undone change

#### Scenario: Per-user undo isolation
- **WHEN** User A and User B both edit nodes, and User A presses undo
- **THEN** only User A's last change SHALL be reversed
- **AND** User B's changes SHALL remain intact

#### Scenario: Undo when stack is empty
- **WHEN** the user presses undo but the undo stack is empty
- **THEN** the `undo()` call SHALL change nothing

### Requirement: Full property fidelity on undo/redo of delete

When a node (or subtree) is deleted and the deletion is undone, the system SHALL restore every node property stored in the Y.Doc: coordinates, colors, font, image, link, parent reference, k value, protected state, and main-root mark. The redo of such an undo (re-delete) and subsequent undo (re-restore) SHALL also preserve full property fidelity.

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

#### Scenario: Undo of a tree delete restores the root without a parent

- **GIVEN** a root `R` that does not carry the main-root mark has child `S`
- **WHEN** `R` is deleted and the user triggers undo
- **THEN** the Y.Doc SHALL contain `R` with a null parent and no main-root mark
- **AND** `S.parent` SHALL be `R.id`

#### Scenario: Multiple undo/redo cycles preserve properties

- **GIVEN** a node exists with specific coordinates and properties
- **WHEN** the node is deleted, then undo, then redo (re-delete), then undo (re-restore)
- **THEN** after the final undo, the node's properties in Y.Doc SHALL match the original values exactly

### Requirement: Reactive canUndo and canRedo state
`MapSyncService` SHALL expose `canUndo$` and `canRedo$` as `Observable<boolean>`. `YjsSyncService` SHALL update both from the undo manager's `stack-item-added`, `stack-item-popped` and `stack-cleared` events.

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

### Requirement: Toolbar drives undo and redo through MapSyncService
The toolbar SHALL call `mapSyncService.undo()` and `mapSyncService.redo()`, and SHALL derive the disabled state of both buttons from `canUndo$` and `canRedo$` and from edit mode.

#### Scenario: Toolbar undo
- **WHEN** the user clicks the undo button
- **THEN** the toolbar SHALL call `mapSyncService.undo()`

#### Scenario: Toolbar button state
- **WHEN** `canUndo$` emits `false` or edit mode is off
- **THEN** the undo button SHALL be disabled
- **AND** the redo button SHALL follow `canRedo$` and edit mode the same way
