## Context

TeamMapper's undo/redo is currently driven by MMP's internal `History` class — a snapshot-based system that saves a full copy of all nodes after each change and redraws the map when undoing/redoing. When the Yjs feature flag is active, the `MapSyncService` bridge writes MMP's undo/redo diffs to the Y.Doc via `writeUndoRedoDiffToYDoc()`, but this has two problems:

1. MMP's history stack is polluted by remote changes — `addNodesFromServer` calls `addNodes()` with `updateHistory=true` (default), and `removeNode()` calls `history.save()` unconditionally. This means User A's undo stack contains User B's edits.
2. The diff-based approach writes undo results as forward operations to Y.Doc. Other clients see these as new changes, not undos. There is no per-user undo semantics.

Yjs provides `Y.UndoManager`, which observes Y.Doc transactions tagged with a specific origin, captures deltas, and can reverse them. Each client gets its own UndoManager instance — User A's undo only reverses User A's Y.Doc writes.

Key constraint: MMP cannot be modified. It will continue saving history snapshots internally, but when Yjs is active, nothing external reads or acts on that history.

## Goals / Non-Goals

**Goals:**
- Per-user collaborative undo/redo when `yjsEnabled` is true
- Toolbar buttons route to `Y.UndoManager` instead of MMP's `History`
- Reactive `canUndo`/`canRedo` state for the toolbar
- Clean lifecycle management (create/destroy UndoManager with Y.Doc)

**Non-Goals:**
- Modifying the MMP library
- Undo/redo changes when `yjsEnabled` is false (MMP history continues as-is)
- Keyboard shortcuts (separate concern)
- Server-side changes (UndoManager is client-only)
- Grouping heuristics beyond Yjs defaults (can be tuned later)

## Decisions

### 1. Transaction origin tracking with a dedicated constant

**Decision:** All local MMP-to-YDoc write operations pass `'local'` as the transaction origin. The `Y.UndoManager` is configured with `trackedOrigins: new Set(['local'])`.

```typescript
// Every local write:
this.yDoc.transact(() => {
  nodesMap.set(nodeId, yNode);
}, 'local');

// UndoManager setup:
new Y.UndoManager(nodesMap, {
  trackedOrigins: new Set(['local']),
});
```

**Affected write methods** (all in `MapSyncService`):
- `writeNodeCreateToYDoc` — needs wrapping in `transact(..., 'local')`
- `writeNodeUpdateToYDoc` — single `yNode.set()` call, needs wrapping
- `writeNodeRemoveFromYDoc` — already uses `transact()`, add origin
- `writeNodesPasteToYDoc` — already uses `transact()`, add origin
- `writeMapOptionsToYDoc` — individual `set()` calls, needs wrapping

**Import is excluded:** `writeImportToYDoc` uses a separate origin (`'import'`) so full map replacements are not undoable. Undoing an import would be destructive and confusing.

**Alternative considered:** Using the Y.Doc `clientID` as the origin. Rejected because `clientID` changes on reconnect (new Y.Doc instance), and a string constant is simpler and more explicit.

### 2. UndoManager scope: `nodesMap` only (initially)

**Decision:** Track only `Y.Map("nodes")`. Map options (`fontMaxSize`, `fontMinSize`, `fontIncrement`) are excluded from undo tracking.

**Rationale:** Map options are global settings rarely changed. Including them would mean undoing a node edit could unexpectedly revert a font size change made between edits. Keeping the scope to nodes matches user expectations — undo reverses the last node-level operation.

**Alternative considered:** Tracking both `[nodesMap, optionsMap]`. Deferred — can be added if users request it.

### 3. Echo prevention: origin-based filtering in `observeDeep`

**Decision:** Replace the current `transaction.local` check with origin-based filtering:

```
Current:  if (transaction.local) return;
Proposed: if (transaction.local && transaction.origin !== this.yUndoManager) return;
```

**Why this is needed:** When `Y.UndoManager.undo()` executes, it creates a local transaction (origin = the UndoManager instance). The current observer skips all local transactions, which means undo changes would never reach MMP. The updated check allows UndoManager-originated transactions through so the bridge can apply node adds/updates/deletes to MMP for rendering.

The same logic applies to the `mapOptions` observer, though it is less critical since map options are excluded from undo tracking.

### 4. Toolbar routing: conditional delegation via `MapSyncService`

**Decision:** `MapSyncService` exposes `undo()`, `redo()`, `canUndo$`, and `canRedo$`. The toolbar checks `yjsEnabled` (via `SettingsService`) to decide whether to call `mapSyncService.undo()` or `mmpService.undo()`.

**`canUndo$` / `canRedo$` implementation:** `Y.UndoManager` emits `'stack-item-added'` and `'stack-item-popped'` events. On each event, emit the current `undoStack.length > 0` / `redoStack.length > 0` to a `BehaviorSubject`.

**Alternative considered:** Having `MapSyncService.undo()` internally check `yjsEnabled` and delegate to either Y.UndoManager or MMP. Rejected because the toolbar already needs to know `yjsEnabled` for the `canUndoRedo` check — it's cleaner to have the routing in one place (the toolbar) than hidden inside the service.

### 5. Lifecycle: create with Y.Doc, destroy on reset

**Decision:** `Y.UndoManager` is created in `initYjs()` after the Y.Doc and nodesMap are ready (after first sync). Destroyed in `resetYjs()` before `yDoc.destroy()`.

```
initYjs() → Y.Doc created → WebSocket connected → first sync
  → handleFirstYjsSync() → loadMapFromYDoc() → setupYjsNodesObserver()
  → CREATE Y.UndoManager (after observer, so initial load is not captured)

resetYjs() → DESTROY Y.UndoManager → unsubscribe listeners → destroy provider → destroy Y.Doc
```

**Critical timing:** The UndoManager must be created AFTER `loadMapFromYDoc()` completes. If created before, the initial map hydration (which writes nodes to Y.Doc during first sync) would fill the undo stack with "undo the entire map" operations.

### 6. Removal of diff-based undo bridge

**Decision:** Remove `setupYjsUndoRedoHandlers()` and `writeUndoRedoDiffToYDoc()` (plus its helpers `writeAddedNodesToYDoc`, `writeUpdatedNodesToYDoc`, `writeDeletedNodesFromYDoc`). These become dead code — Y.UndoManager handles undo/redo natively through Y.Doc without needing to compute and apply diffs.

The MMP `undo`/`redo` events are no longer subscribed to in the Yjs path. MMP's `History.undo()` / `History.redo()` are never called when Yjs is active.

## Risks / Trade-offs

**[MMP history accumulates unused snapshots]** → MMP internally calls `history.save()` on node operations, building up a snapshot array that nobody reads. Mitigation: Mind maps are small (tens to hundreds of nodes). Memory overhead is negligible. Fixing this would require MMP modifications, which is out of scope.

**[UndoManager capture granularity]** → `Y.UndoManager` uses a default `captureTimeout` of 500ms — changes within this window are grouped into a single undo step. When dragging a node, rapid coordinate updates may group into one undo step (desirable). But two quick edits to different nodes within 500ms would also group (potentially surprising). Mitigation: 500ms is the Yjs default and works well for most editors. Can be tuned later if user feedback warrants it.

**[Undo after reconnect]** → If a client disconnects and reconnects, a new `Y.Doc` and `Y.UndoManager` are created. The undo stack is lost. Mitigation: This matches standard editor behavior (e.g., refreshing a Google Doc clears undo history). The Y.Doc state itself is preserved — only the local undo stack resets.

**[Observer ordering with UndoManager]** → The `observeDeep` callback needs to handle UndoManager-originated transactions (adds, deletes, updates) the same way it handles remote changes. The existing `applyRemoteNodeAdd`/`applyRemoteNodeDelete`/`applyYDocPropertyToMmp` methods should work unchanged since they only care about Y.Doc state, not transaction origin. Mitigation: Thorough testing of undo/redo for create, update, delete, and paste operations.

## Open Questions

- **Should `captureTimeout` be configurable?** The default 500ms groups rapid changes. For node dragging this is good, but it could group unrelated edits. Worth tuning based on user testing?
- **Undo scope for multi-node operations:** When a user deletes a node with descendants, the bridge deletes all descendants in one transaction. UndoManager captures this as one undo step (restores parent + all children). Is this the desired behavior, or should each node be a separate undo step?
