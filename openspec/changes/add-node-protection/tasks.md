The three sections shipped together in one pull request. Section 1 removes the old locked toggle. Section 2 adds the `protected` flag to storage and sync. Section 3 adds the button, the refusals and the badge.

## 1. Remove the locked toggle

- [x] 1.1 Drop the `node.locked` check in `Drag.dragged` and `Drag.ended`, so a drag always moves and reports the descendants
- [x] 1.2 Remove `locked` from `UserNodeProperties`, the node schema, `normalizeMapData`, the mmp `Node` model, options, `nodes.ts` update map and `updateNodeLockedStatus`
- [x] 1.3 Remove `locked` from the Y.Doc conversion in the frontend and the backend, `clientServerMapping`, the seed job, `import.service.ts`, `server-types.ts` and the frontend mmp mock
- [x] 1.4 Remove the group button from the toolbar, the root-node lock error handling in `MmpService` and the unused i18n keys
- [x] 1.5 Drop the `locked` column from `MmpNode` and add the up and down migration
- [x] 1.6 Replace the glossary entry **Locked node** and the drag entry's lock sentence
- [x] 1.7 Tests: dragging any node moves its descendants, importing a JSON file with `locked` succeeds, the Y.Doc round trip carries no `locked`

## 2. The protected flag in storage and sync

- [x] 2.1 Add `protected` to `UserNodeProperties`, the node schema with default `false`, and `normalizeMapData`
- [x] 2.2 Add `Nodes.protectingNode(id)` to `packages/mmp`, walking up `Node.parent`
- [x] 2.3 Add the `protected` column to `MmpNode` and the migration, and map it in `clientServerMapping` and the backend Y.Doc conversion
- [x] 2.4 Carry `protected` in the frontend Y.Doc conversion, the mmp `Node` model and `getNodeProperties`, and add it to `updateNode`
- [x] 2.5 Copy the flag in map duplication and JSON export, write `false` for pasted nodes and Mermaid import
- [x] 2.6 Tests: `protectingNode` for self, ancestor and none; the flag round-trips through the client mapping and the Y.Doc; undo of a delete restores it

## 3. Protect, release and refuse

- [x] 3.1 Add `protectBranch` and `releaseBranch` to `packages/mmp`, writing the flag and clearing descendant flags, and export them from the entry point. `MapSyncService.toggleBranchProtection` wraps the toggle in one Y.Doc transaction
- [x] 3.2 Refuse local rename, style, image, link, font, drag, add child, paste, remove and cut inside a protected branch, emitting `nodeProtected`, and skip the check when `notifyWithEvent` is false
- [x] 3.3 Draw the lock badge on the node carrying the flag and redraw it on local and remote changes
- [x] 3.4 Replace the toolbar slot with the lock and unlock button, disabled with no selection and on read-only clients
- [x] 3.5 Show a toastr warning on `nodeProtected` in `MmpService`
- [x] 3.6 Add the tooltips and the notice to every language file
- [x] 3.7 Add the **Protected branch** glossary entry
- [x] 3.8 mmp specs: every refused action leaves the node unchanged; remote updates and undo apply inside a protected branch; dragging an unprotected parent moves a protected child; protecting a parent clears a child's flag
- [x] 3.9 E2E: client A protects a branch, client B sees the badge, cannot rename a child, releases it, then renames it
