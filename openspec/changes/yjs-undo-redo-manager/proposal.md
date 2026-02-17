## Why

When Yjs is active, undo/redo uses MMP's snapshot-based history which has no concept of "my changes vs your changes." MMP's history stack gets polluted by remote changes (both `addNodesFromServer` and `removeNode` unconditionally call `history.save()`), so pressing undo may reverse another user's edit. Yjs provides `Y.UndoManager` which tracks changes by transaction origin, giving proper per-user collaborative undo — User A's undo only reverses User A's changes, regardless of concurrent edits by others.

## What Changes

- **Add `Y.UndoManager` to `MapSyncService`**: When `yjsEnabled`, create a `Y.UndoManager` tracking the `nodesMap` (and optionally `mapOptions`). All local write operations use a tracked transaction origin (`'local'`). Import operations use a separate untracked origin so they are not undoable.
- **Route toolbar undo/redo through `MapSyncService`**: When `yjsEnabled`, toolbar buttons and keyboard shortcuts call `mapSyncService.undo()`/`redo()` which delegate to `Y.UndoManager`, bypassing MMP's `History` entirely. When Yjs is disabled, the existing MMP undo/redo path is unchanged.
- **Expose `canUndo`/`canRedo` observables**: `MapSyncService` exposes reactive state derived from `Y.UndoManager.undoStack`/`redoStack` so the toolbar can enable/disable buttons.
- **Update `observeDeep` echo prevention**: Allow `Y.UndoManager`-originated transactions to pass through to MMP (they are local but need to update the renderer).
- **Remove diff-based undo bridge**: `setupYjsUndoRedoHandlers()` and `writeUndoRedoDiffToYDoc()` are no longer needed when `Y.UndoManager` handles undo natively through Y.Doc.
- **MMP history becomes inert when Yjs is active**: MMP internally still calls `history.save()` (we don't modify MMP), but no external code reads or acts on it. This is acceptable — mind maps are small and the memory overhead is negligible.

## Non-goals

- Modifying the MMP library in any way
- Disabling MMP's internal `history.save()` calls (would require MMP changes)
- Adding undo/redo support when Yjs is disabled (existing MMP history continues to work)
- Keyboard shortcuts for undo/redo (can be added separately; this change focuses on the undo mechanism)
- Server-side changes (Y.UndoManager is purely a frontend concern)

## Capabilities

### New Capabilities
- `yjs-undo`: Y.UndoManager lifecycle, transaction origin tracking, toolbar integration, canUndo/canRedo observables, and echo prevention for undo-originated transactions

### Modified Capabilities
- `yjs-bridge`: The MMP-to-YDoc write operations need transaction origins on all `yDoc.transact()` calls, and the YDoc-to-MMP observer needs updated echo prevention logic to allow UndoManager-originated transactions through

## Impact

- **`MapSyncService`** (`map-sync.service.ts`): New `Y.UndoManager` field, `undo()`/`redo()` public methods, `canUndo$`/`canRedo$` observables, transaction origins on all write methods, updated observer logic, removal of `setupYjsUndoRedoHandlers` and `writeUndoRedoDiffToYDoc`
- **Toolbar** (`toolbar.component.ts/html`): Conditional routing of undo/redo clicks and `canUndoRedo` check based on `yjsEnabled`
- **No new dependencies**: `Y.UndoManager` is part of the `yjs` package already installed
- **No backend changes**: UndoManager is client-side only
- **No breaking changes**: Behavior is unchanged when `yjsEnabled` is false
