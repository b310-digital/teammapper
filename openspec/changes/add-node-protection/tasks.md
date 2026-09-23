Each section is one pull request and leaves `main` releasable. PR 1 removes the old locked toggle. PR 2 adds the `protected` flag to storage and sync with no way to set it in the UI. PR 3 adds the button, the refusals and the badge. No feature flag is needed, because nothing user-visible changes until PR 3 ships complete.

## 1. PR 1: remove the locked toggle

- [ ] 1.1 Drop the `node.locked` check in `Drag.dragged` and `Drag.ended`, so a drag always moves and reports the descendants
- [ ] 1.2 Remove `locked` from `UserNodeProperties`, the node schema, `normalizeMapData`, the mmp `Node` model, options, `nodes.ts` update map and `updateNodeLockedStatus`
- [ ] 1.3 Remove `locked` from the Y.Doc conversion in the frontend and the backend, `clientServerMapping`, the seed job, `import.service.ts`, `server-types.ts` and the frontend mmp mock
- [ ] 1.4 Remove the group button from the toolbar, the root-node lock error handling in `MmpService` and the unused i18n keys
- [ ] 1.5 Drop the `locked` column from `MmpNode` and add the up and down migration
- [ ] 1.6 Replace the glossary entry **Locked node** and the drag entry's lock sentence
- [ ] 1.7 Tests: dragging any node moves its descendants, importing a JSON file with `locked` succeeds, the Y.Doc round trip carries no `locked`

## 2. PR 2: the protected flag in storage and sync

- [ ] 2.1 Add `protected` to `UserNodeProperties`, the node schema with default `false`, and `normalizeMapData`
- [ ] 2.2 Add `protectingNode(nodes, id)` to the shared algorithms
- [ ] 2.3 Add the `protected` column to `MmpNode` and the migration, and map it in `clientServerMapping` and the backend Y.Doc conversion
- [ ] 2.4 Carry `protected` in the frontend Y.Doc conversion, the mmp `Node` model and `getNodeProperties`, and add it to `updateNode`
- [ ] 2.5 Copy the flag in map duplication and JSON export, write `false` for pasted nodes and Mermaid import
- [ ] 2.6 Tests: `protectingNode` for self, ancestor, none and a root; the flag round-trips through the database, the Y.Doc and a duplicate; undo of a delete restores it

## 3. PR 3: protect, release and refuse

- [ ] 3.1 Add `protectBranch` and `releaseBranch` to `packages/mmp`, writing the flag and clearing descendant flags in one update, and export them from the entry point
- [ ] 3.2 Refuse local rename, style, image, link, font, drag, add child, paste, remove and cut inside a protected branch, emitting `nodeProtected`, and skip the check when `notifyWithEvent` is false
- [ ] 3.3 Draw the lock badge on the node carrying the flag and redraw it on local and remote changes
- [ ] 3.4 Replace the toolbar slot with the lock and unlock button, disabled with no selection and on read-only clients
- [ ] 3.5 Show the snackbar on `nodeProtected` in `MmpService`
- [ ] 3.6 Add the tooltips and the notice to every language file
- [ ] 3.7 Add the **Protected branch** glossary entry
- [ ] 3.8 mmp specs: every refused action leaves the node unchanged; remote updates and undo apply inside a protected branch; dragging an unprotected parent moves a protected child; protecting a parent clears a child's flag
- [ ] 3.9 E2E: client A protects a branch, client B sees the badge, cannot rename a child, releases it, then renames it
