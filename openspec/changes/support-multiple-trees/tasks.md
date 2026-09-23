Each section is one pull request of about 500 changed lines, counting tests, and none is under 400 or over 700. Every PR leaves `main` releasable and ships in the listed order. PRs 1 to 3 change nothing for a map with one tree, and PRs 4 to 7 add behavior only behind the `multiTree` flag. The line counts are estimates.

## 1. PR 1: the renderer accepts several roots (about 450 lines)

- [x] 1.1 Make `Nodes.addNode` accept an explicit `null` parent for a root, and make `Nodes.addNodes` pass `null` for an empty parent instead of falling back to the selected node
- [x] 1.2 Add a lookup for the root of a node's own tree, and compare against it in `getOrientation`, which moves keyboard navigation, drag feedback and paste mirroring along with it
- [x] 1.3 Split the children of any root left and right in `pickColumn`, and apply the root rules of `moveSelectionOnLevel` and `updateNodeBranchColor` to every root
- [x] 1.4 Give every root branch color `''` by default
- [x] 1.5 Write unit tests: a root loaded by `addNodes` stays parentless whatever is selected, a child of a second root lands on the side `pickColumn` picks for it, orientation reads the node's own tree root, single-tree output is unchanged

## 2. PR 2: multi-root algorithms and the sync observer (about 550 lines)

- [x] 2.1 Add `findRootNodes` returning every node with no parent, main root first, and keep `findMainRoot` for single-root callers
- [x] 2.2 Rewrite `sortNodesParentFirst` to walk from every root and to return the nodes no root reaches in a second list
- [x] 2.3 Add `collectTreeIds` that returns a root plus its descendants, reusing `collectSubtreeIds`
- [x] 2.4 Sort batched adds in `YjsSyncService` with the multi-root `sortNodesParentFirst`
- [x] 2.5 Keep `isFullMapReplacement` reading `isRoot`, and document that it fires only when a transaction rewrites the main root's entry
- [x] 2.6 Write unit tests: two roots ordered main root first, child of a second root after that root, an orphan and its descendants in the second list, a cycle in the second list
- [x] 2.7 Write sync tests: a remote root add and a remote pasted tree apply as ordinary adds and leave the undo stack, a remote import and a remote redistribution reload the map and clear the undo stack
- [x] 2.8 Write a backend test: duplicating a two-root map saves every node
- [x] 2.9 Add an integration test: two clients each add a parentless node through the Y.Doc, and both render every tree

## 3. PR 3: one layout pass per tree (about 500 lines)

- [x] 3.1 Extract the single-tree pass of `LayoutEngine` into a method taking a root and an anchor
- [x] 3.2 Run the pass once per root that is not detached, keep every root with coordinates at them, and place a root without coordinates right of the placed trees
- [x] 3.3 Keep parking detached nodes and orphans with `placeDetachedNodes`
- [x] 3.4 Write unit tests in `layout.spec.ts`: two trees without coordinates do not overlap, each tree branches left and right, a root with coordinates keeps them, a redistribution moves no root, single-tree output is unchanged

## 4. PR 4: add a tree from the toolbar, behind the flag (about 450 lines)

- [ ] 4.1 Add the `multiTree` feature flag to system settings, defaulting to off, and read it in the frontend `SettingsService`
- [ ] 4.2 Show an "add tree" button in place of "add detached node" when `multiTree` is on, with a new translation key in every locale
- [ ] 4.3 Remove the early return in `MmpService.addNode` that refuses children while a detached node is selected
- [ ] 4.4 Place a new root one horizontal spacing right of the bounding box of every tree the client holds, level with the main root, and write its coordinates
- [ ] 4.5 Write unit tests: adding a child to a second root attaches it to that root, the new tree does not overlap the trees the client holds
- [ ] 4.6 Add an e2e test creating a tree and adding two levels of children to it

## 5. PR 5: empty selection (about 500 lines)

- [ ] 5.1 Make the selected node `Node | null` in mmp, make `deselectNode` leave it `null`, and keep selecting the main root on map load
- [ ] 5.2 Narrow every caller of `getSelectedNode` for `null`, and make keys that act on the selected node do nothing without one
- [ ] 5.3 Disable the node-specific toolbar buttons with nothing selected, and keep add tree and paste enabled
- [ ] 5.4 Broadcast an empty selection through presence, and draw no selection ring for that client
- [ ] 5.5 Write unit tests for deselecting, the toolbar states and the presence payload

## 6. PR 6: delete, copy and paste by tree (about 450 lines)

- [ ] 6.1 Delete a root and its descendants in one operation, and refuse to delete the main root
- [ ] 6.2 Keep the copy and cut guard on `isRoot`, and copy any other root with its tree
- [ ] 6.3 Write `isRoot = false` on every pasted node in `CopyPaste.paste`
- [ ] 6.4 With nothing selected and `multiTree` on, paste the copied nodes as an independent tree placed like 4.4, with a pasted root of branch color `''`
- [ ] 6.5 Write unit tests for each rule, including deleting the main root while other trees exist and pasting onto the selected main root
- [ ] 6.6 Add e2e tests: copy a tree, deselect, paste, both trees render; delete a second tree, the main tree stays

## 7. PR 7: Mermaid per tree and orphan-safe saving (about 500 lines)

- [ ] 7.1 Write one `mindmap` block per root in `ExportService`, separated by a blank line, ordered main root first
- [ ] 7.2 Build the children map from every node, and stop skipping detached nodes
- [ ] 7.3 Split an imported document at each `mindmap` line and parse each block on its own
- [ ] 7.4 Build one snapshot from every block, mark only the first block's root with `isRoot`, and replace the map with a single `importMap` call
- [ ] 7.5 Leave out the nodes no root reaches in `orderNodesFromRoot`, and log their ids
- [ ] 7.6 Write unit tests: a two-tree map exports two blocks and re-imports to the same trees, and only the first imported root carries `isRoot`
- [ ] 7.7 Write backend tests: a Y.Doc holding an orphan persists every other node, and a map holding an orphan duplicates without it

## 8. PR 8: release several trees and retire the detached node (about 650 lines, mostly deletions)

- [ ] 8.1 Remove the `multiTree` flag from system settings and the frontend, together with the single-tree branches it guarded
- [ ] 8.2 Write a migration that sets the parent to null on any detached row carrying one, then drops `mmp_node.detached`, with a down-migration re-adding the column with default `false`
- [ ] 8.3 Remove `detached` from `packages/shared` models, schemas and `normalizeMapData`, from the backend entity, `clientServerMapping` and `yDocConversion`, and from the frontend Y.Doc utilities
- [ ] 8.4 Remove `detached` from the mmp `Node` model, `options.ts`, `history.ts`, `getSiblings`, `pickColumn`, `stackBelow` and `LayoutInputNode`
- [ ] 8.5 Rename `placeDetachedNodes` to an orphan fallback, and remove the detached test cases or turn them into orphan cases
- [ ] 8.6 Remove the "add detached node" button, `addDetachedNode`, the detached branch of `MmpService.addNode`, and the `ADD_DETACHED_NODE` translation key
- [ ] 8.7 Update `docs/glossary.md` (root node, main root, tree, orphaned node; remove detached node), the `yjs-undo` spec, and the e2e fixture `test-map.json`
- [ ] 8.8 Run the Playwright suite in the `playwright` container
