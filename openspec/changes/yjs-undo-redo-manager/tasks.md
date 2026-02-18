## 1. Add transaction origins to all Y.Doc write operations

- [x] 1.1 Wrap `writeNodeCreateToYDoc` in `yDoc.transact(() => { ... }, 'local')` — currently writes without a transaction
- [x] 1.2 Wrap `writeNodeUpdateToYDoc` in `yDoc.transact(() => { ... }, 'local')` — currently a bare `yNode.set()` call
- [x] 1.3 Add `'local'` origin to `writeNodeRemoveFromYDoc` — already uses `yDoc.transact()`, add second argument
- [x] 1.4 Add `'local'` origin to `writeNodesPasteToYDoc` — already uses `yDoc.transact()`, add second argument
- [x] 1.5 Wrap `writeMapOptionsToYDoc` in `yDoc.transact(() => { ... }, 'local')` — currently individual `set()` calls
- [x] 1.6 Change `writeImportToYDoc` to use `'import'` origin — already uses `yDoc.transact()`, change to untracked origin
- [x] 1.7 Write unit tests verifying each write method uses the correct transaction origin

## 2. Add Y.UndoManager lifecycle to MapSyncService

- [x] 2.1 Add `private yUndoManager: Y.UndoManager | null = null` field to `MapSyncService`
- [x] 2.2 Create `initYjsUndoManager()` method that instantiates `Y.UndoManager` on `nodesMap` with `trackedOrigins: new Set(['local'])`
- [x] 2.3 Call `initYjsUndoManager()` in `handleFirstYjsSync()` AFTER `loadMapFromYDoc()` and `setupYjsNodesObserver()` complete
- [x] 2.4 Add `yUndoManager.destroy()` to `resetYjs()` before `yDoc.destroy()`
- [x] 2.5 Write unit tests: UndoManager created after first sync, destroyed on reset, undo stack empty after init

## 3. Update echo prevention in Y.Doc observers

- [x] 3.1 Change `setupYjsNodesObserver` filter from `if (transaction.local) return` to `if (transaction.local && transaction.origin !== this.yUndoManager) return`
- [x] 3.2 Apply same origin-based filter in `setupYjsMapOptionsObserver` if applicable
- [x] 3.3 Write unit tests: local edit skipped, remote edit applied, UndoManager-originated edit applied to MMP

## 4. Expose undo/redo methods and reactive state

- [x] 4.1 Add public `undo()` method that calls `this.yUndoManager?.undo()`
- [x] 4.2 Add public `redo()` method that calls `this.yUndoManager?.redo()`
- [x] 4.3 Add `canUndo$` and `canRedo$` as `BehaviorSubject<boolean>` fields, exposed as `Observable<boolean>`
- [x] 4.4 Subscribe to UndoManager `stack-item-added` and `stack-item-popped` events to update `canUndo$`/`canRedo$`
- [x] 4.5 Clean up UndoManager event listeners in `resetYjs()`
- [x] 4.6 Write unit tests: canUndo$/canRedo$ emit correctly after edit, undo, redo, and stack empty

## 5. Remove diff-based undo bridge

- [x] 5.1 Remove `setupYjsUndoRedoHandlers()` method and its call site in `setupYjsMmpEventHandlers()`
- [x] 5.2 Remove `writeUndoRedoDiffToYDoc()`, `writeAddedNodesToYDoc()`, `writeUpdatedNodesToYDoc()`, `writeDeletedNodesFromYDoc()` methods
- [x] 5.3 Remove unused imports (`MapDiff`, `SnapshotChanges` from `@mmp/map/handlers/history`) if no longer referenced — kept, still used in Socket.io path
- [x] 5.4 Update existing unit tests that reference the removed methods — no tests referenced removed methods

## 6. Update toolbar to route undo/redo conditionally

- [x] 6.1 Inject `MapSyncService` and `SettingsService` into toolbar component (check if already available)
- [x] 6.2 Add `yjsEnabled` property to toolbar, read from `SettingsService.getCachedSystemSettings().featureFlags.yjs`
- [x] 6.3 Update undo button `(click)` to call `mapSyncService.undo()` when `yjsEnabled`, else `mmpService.undo()`
- [x] 6.4 Update redo button `(click)` to call `mapSyncService.redo()` when `yjsEnabled`, else `mmpService.redo()`
- [x] 6.5 Update `canUndoRedo` getter: when `yjsEnabled`, subscribe to `canUndo$`/`canRedo$`; when not, use existing `mmpService.history()` check
- [x] 6.6 Write unit tests for toolbar conditional routing (both Yjs and non-Yjs paths)

## 7. Integration testing

- [x] 7.1 Write integration test: create node, undo reverses it, redo restores it
- [x] 7.2 Write integration test: undo after import is no-op (import not captured)
- [x] 7.3 Write integration test: undo/redo button disabled state matches UndoManager stack
- [x] 7.4 Verify existing Playwright e2e tests pass (undo/redo toolbar buttons still functional)

## 8. Fix coordinate preservation in `addNode()` (MMP)

- [ ] 8.1 Make `calculateCoordinates()` conditional at `nodes.ts:124` — skip when incoming properties already contain valid (non-zero) coordinates
- [ ] 8.2 Write unit tests: node added with existing coordinates preserves them; node added without coordinates gets calculated positions; root node at (0,0) is not recalculated
- [ ] 8.3 Verify `applyCoordinatesToMapSnapshot()` still works correctly (uses same pattern)

## 9. Fix parent-first ordering in observer batch processing

- [ ] 9.1 In `handleTopLevelNodeChanges`, collect all added keys from `keysChanged`, then sort parent-first using `sortParentFirst()` before calling `applyRemoteNodeAdd()`
- [ ] 9.2 Write unit test: when a parent and child are added in a single transaction, parent is processed before child regardless of Y.Map iteration order

## 10. Undo/redo coordinate preservation tests

- [ ] 10.1 Write integration test: delete node, undo restores node at original coordinates (not recalculated)
- [ ] 10.2 Write integration test: delete subtree (parent + descendants), undo restores all nodes at original coordinates
- [ ] 10.3 Write integration test: delete subtree, undo, redo, undo — coordinates preserved across multiple cycles
- [ ] 10.4 Write integration test: delete subtree, undo, redo, undo — always operates on whole branch (undo stack not fragmented into individual node operations)
