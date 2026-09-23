Work starts after every PR of `support-multiple-trees` has shipped. Each section is one pull request and leaves `main` releasable. PRs 1 to 3 add arrows to storage, sync and rendering with no way to create one in the UI, so a map without arrows behaves as today. PR 4 adds creation behind the `arrows` flag, PR 5 adds selection, copy, paste and export unflagged, and PR 6 removes the flag.

## 1. PR 1: shared types and storage

- [ ] 1.1 Add `MapArrow` (`source`, `target`), its valibot schema and `arrowKey(source, target)` to `packages/shared`, the JSON export type holding `nodes` and `arrows`, and `arrows: MapArrow[]` on `ClientMap`
- [ ] 1.2 Add `canConnect(nodes, arrows, source, target)` to the shared algorithms, returning the refusal reason or `null`
- [ ] 1.3 Add the `MmpArrow` entity with the primary key `(nodeMapId, sourceNodeId, targetNodeId)` and composite foreign keys to `mmp_node`, cascade on delete
- [ ] 1.4 Add the up and down migration
- [ ] 1.5 Return arrows from `MapsService.exportMapToClient`, so the map read, create and duplicate responses carry them
- [ ] 1.6 Copy arrow rows with the new map id and unchanged node ids when duplicating a map, after the nodes
- [ ] 1.7 Insert `clientMap.arrows` after the nodes in `MapsService.updateMap`, and pass an empty list from the seed job
- [ ] 1.8 Write unit tests for `canConnect`: self, duplicate, parent and child in both directions, opposite direction allowed
- [ ] 1.9 Write backend tests: deleting a node deletes its arrows, deleting a map deletes its arrows, duplicating keeps arrows with the same node ids, the map read returns arrows, `updateMap` replaces arrows

## 2. PR 2: persistence and hydration

- [ ] 2.1 Add `Y.Map("arrows")` to the Y.Doc conversion, keyed by `arrowKey`, and hydrate it from `mmp_arrow`
- [ ] 2.2 After the node upsert, delete every `mmp_arrow` row of the map and insert the Y.Doc's arrows, leaving out dangling arrows and entries whose key does not match their fields, with a debug log line per left-out key
- [ ] 2.3 Write persistence tests: arrows round-trip, two consecutive saves of an unchanged map both commit, an arrow removed between surviving nodes leaves the database, a dangling arrow does not fail the save and stays in the Y.Doc, a hydration after unload drops it

## 3. PR 3: rendering and sync in `packages/mmp` and the frontend

- [ ] 3.1 Add the arrow layer between branches and nodes, with the shared arrowhead marker and the dashed style for both themes
- [ ] 3.2 Draw each arrow as a curve clipped at both node borders, reusing `node-geometry.ts`
- [ ] 3.3 Keep every arrow in the renderer, draw only those with both endpoints present and visible, and re-evaluate an arrow when an endpoint is added, removed, hidden or shown
- [ ] 3.4 Redraw attached arrows from the coordinate setter, `moveNodeTo` with one pass after redistribute, `Draw.updateNodeShapes`, the hidden toggle and `Draw.update`
- [ ] 3.5 Expose `addArrow`, `removeArrow`, `getArrows` and `arrowKey` through `packages/mmp/src/index.ts`, with `notifyWithEvent` on the writes, emit `arrowCreate` and `arrowRemove`, and forward them in `MmpService` and `YjsSyncService`
- [ ] 3.6 Observe `arrowsMap` in `YjsSyncService` with the node observer's origin filter, applying adds and deletes idempotently, and load arrows in `loadMapFromYDoc`
- [ ] 3.7 Add `arrowsMap` to the `Y.UndoManager` scope
- [ ] 3.8 Remove attached arrows in the same local transaction as a node removal or cut
- [ ] 3.9 Clear and rewrite `arrowsMap` in the import replacement, and leave it untouched in the redistribute replacement
- [ ] 3.10 Extend the frontend mmp mock in `src/test/mocks/mmp.ts`
- [ ] 3.11 Write mmp specs: clipping, hidden endpoint, missing endpoint drawn once the node arrives, arrows follow a drag, a coordinate update, a resize and a redistribute, removal takes arrows along
- [ ] 3.12 Write sync tests: a remote arrow add and delete apply, an undo that restores a node and its arrows draws both in either observer order, a peer import shows exactly its arrows, redistribute keeps arrows, the initial hydration leaves the undo stack empty

## 4. PR 4: arrow mode behind the flag

- [ ] 4.1 Add `arrows` to `SystemFeatureFlags`, defaulting to off, and read it in the frontend `SettingsService`
- [ ] 4.2 Add arrow mode to `packages/mmp`: preview to the pointer, refused targets marked, create on an allowed click, end on Escape, empty space or the button again
- [ ] 4.3 End arrow mode when the source is removed or hidden, on a full-map replacement and on losing write access
- [ ] 4.4 Ignore every map shortcut except Escape and block node drag in arrow mode, and end arrow mode before another toolbar button acts
- [ ] 4.5 Add the "connect with arrow" toolbar button and the `alt+a` shortcut for writable clients, with translation keys in every locale and an entry in the shortcut dialog
- [ ] 4.6 Show the refusal reason as a toast for every refused target, the source included, and keep arrow mode on
- [ ] 4.7 Write unit tests for arrow mode state, including each way it ends
- [ ] 4.8 Add an e2e test: create an arrow, reload, the arrow is still drawn

## 5. PR 5: selection, copy, paste and export

- [ ] 5.1 Select an arrow on click with a widened hit area, deselecting the node; clear it when a node is selected, on empty space and when a peer removes the arrow or an endpoint
- [ ] 5.2 Route the remove action (`-`, `backspace`, `delete`, toolbar remove) to the selected arrow, add `delete` to the remove shortcut and the shortcut dialog, and make node shortcuts no-ops while an arrow is selected
- [ ] 5.3 Copy arrows inside the copied subtree and paste them between the pasted nodes in the paste transaction
- [ ] 5.4 Write the `{ nodes, arrows }` JSON export, accept it and the bare node list on import, drop arrows `canConnect` refuses, and clear arrows on Mermaid import
- [ ] 5.5 Leave arrows out of Mermaid export
- [ ] 5.6 Write unit tests: `-` with an arrow selected keeps every node, paste keeps inner arrows and drops outer ones, JSON round trip, legacy node list import, Mermaid import and export without arrows
- [ ] 5.7 Add e2e tests: remove a selected arrow and undo it, remove a node with an arrow and undo once, import and undo once restores the old arrows

## 6. PR 6: remove the flag and document

- [ ] 6.1 Remove the `arrows` flag and its reads
- [ ] 6.2 Add the **arrow** entry to `docs/glossary.md` and drop it from the reserved words
- [ ] 6.3 Note in the release notes that JSON files with arrows do not import into older versions
- [ ] 6.4 Add e2e tests with two clients: one creates an arrow and the other draws it, one moves an endpoint and the other redraws the arrow, both create the same arrow and one delete removes it for both
