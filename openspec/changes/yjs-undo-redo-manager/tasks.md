## 1. Add transaction origins to all Y.Doc write operations

- [ ] 1.1 Wrap `writeNodeCreateToYDoc` in `yDoc.transact(() => { ... }, 'local')` — currently writes without a transaction
- [ ] 1.2 Wrap `writeNodeUpdateToYDoc` in `yDoc.transact(() => { ... }, 'local')` — currently a bare `yNode.set()` call
- [ ] 1.3 Add `'local'` origin to `writeNodeRemoveFromYDoc` — already uses `yDoc.transact()`, add second argument
- [ ] 1.4 Add `'local'` origin to `writeNodesPasteToYDoc` — already uses `yDoc.transact()`, add second argument
- [ ] 1.5 Wrap `writeMapOptionsToYDoc` in `yDoc.transact(() => { ... }, 'local')` — currently individual `set()` calls
- [ ] 1.6 Change `writeImportToYDoc` to use `'import'` origin — already uses `yDoc.transact()`, change to untracked origin
- [ ] 1.7 Write unit tests verifying each write method uses the correct transaction origin

## 2. Add Y.UndoManager lifecycle to MapSyncService

- [ ] 2.1 Add `private yUndoManager: Y.UndoManager | null = null` field to `MapSyncService`
- [ ] 2.2 Create `initYjsUndoManager()` method that instantiates `Y.UndoManager` on `nodesMap` with `trackedOrigins: new Set(['local'])`
- [ ] 2.3 Call `initYjsUndoManager()` in `handleFirstYjsSync()` AFTER `loadMapFromYDoc()` and `setupYjsNodesObserver()` complete
- [ ] 2.4 Add `yUndoManager.destroy()` to `resetYjs()` before `yDoc.destroy()`
- [ ] 2.5 Write unit tests: UndoManager created after first sync, destroyed on reset, undo stack empty after init

## 3. Update echo prevention in Y.Doc observers

- [ ] 3.1 Change `setupYjsNodesObserver` filter from `if (transaction.local) return` to `if (transaction.local && transaction.origin !== this.yUndoManager) return`
- [ ] 3.2 Apply same origin-based filter in `setupYjsMapOptionsObserver` if applicable
- [ ] 3.3 Write unit tests: local edit skipped, remote edit applied, UndoManager-originated edit applied to MMP

## 4. Expose undo/redo methods and reactive state

- [ ] 4.1 Add public `undo()` method that calls `this.yUndoManager?.undo()`
- [ ] 4.2 Add public `redo()` method that calls `this.yUndoManager?.redo()`
- [ ] 4.3 Add `canUndo$` and `canRedo$` as `BehaviorSubject<boolean>` fields, exposed as `Observable<boolean>`
- [ ] 4.4 Subscribe to UndoManager `stack-item-added` and `stack-item-popped` events to update `canUndo$`/`canRedo$`
- [ ] 4.5 Clean up UndoManager event listeners in `resetYjs()`
- [ ] 4.6 Write unit tests: canUndo$/canRedo$ emit correctly after edit, undo, redo, and stack empty

## 5. Remove diff-based undo bridge

- [ ] 5.1 Remove `setupYjsUndoRedoHandlers()` method and its call site in `setupYjsMmpEventHandlers()`
- [ ] 5.2 Remove `writeUndoRedoDiffToYDoc()`, `writeAddedNodesToYDoc()`, `writeUpdatedNodesToYDoc()`, `writeDeletedNodesFromYDoc()` methods
- [ ] 5.3 Remove unused imports (`MapDiff`, `SnapshotChanges` from `@mmp/map/handlers/history`) if no longer referenced
- [ ] 5.4 Update existing unit tests that reference the removed methods

## 6. Update toolbar to route undo/redo conditionally

- [ ] 6.1 Inject `MapSyncService` and `SettingsService` into toolbar component (check if already available)
- [ ] 6.2 Add `yjsEnabled` property to toolbar, read from `SettingsService.getCachedSystemSettings().featureFlags.yjs`
- [ ] 6.3 Update undo button `(click)` to call `mapSyncService.undo()` when `yjsEnabled`, else `mmpService.undo()`
- [ ] 6.4 Update redo button `(click)` to call `mapSyncService.redo()` when `yjsEnabled`, else `mmpService.redo()`
- [ ] 6.5 Update `canUndoRedo` getter: when `yjsEnabled`, subscribe to `canUndo$`/`canRedo$`; when not, use existing `mmpService.history()` check
- [ ] 6.6 Write unit tests for toolbar conditional routing (both Yjs and non-Yjs paths)

## 7. Integration testing

- [ ] 7.1 Write integration test: create node, undo reverses it, redo restores it
- [ ] 7.2 Write integration test: undo after import is no-op (import not captured)
- [ ] 7.3 Write integration test: undo/redo button disabled state matches UndoManager stack
- [ ] 7.4 Verify existing Playwright e2e tests pass (undo/redo toolbar buttons still functional)
