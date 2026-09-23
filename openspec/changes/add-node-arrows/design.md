## Context

A node knows one relation, its parent, stored as `parent` in `ExportNodeProperties`, as `nodeParentId` on `mmp_node`, and as the `parent` field of a node's entry in `Y.Map("nodes")`. `Draw.drawBranch` draws one branch per node from that field. `MapSnapshot` is a plain node list, and every path that moves a whole map uses it: JSON export and import, Mermaid import, `YjsSyncService` full-map replacement, and map duplication.

`Y.UndoManager` tracks `nodesMap` only, with `trackedOrigins` set to the local origin. Import and redistribute both write a full-map replacement with the local origin, so both are undoable; a replacement from a peer clears the local undo stack.

The backend persists a map in one transaction: it deletes the `mmp_node` rows whose ids are no longer in the Y.Doc, upserts the rest on `(id, nodeMapId)`, and updates the map options. Surviving rows are updated, not reinserted. Map duplication copies the node rows with their ids unchanged and the new map id. `MapsService.updateMap`, used by the seed job, deletes every node of a map and inserts the given ones.

This change builds on `support-multiple-trees`, which ships first. After it, a map holds several trees, a node with no parent is a root, `isRoot` marks the main root only, the `detached` flag is gone, the selected node may be `null`, pasting with nothing selected creates an independent tree, and the save leaves out every node no root reaches.

The glossary reserves **arrow**, **connector** and **line** for "a relation between two nodes that are not parent and child". This change claims **arrow**.

## Goals / Non-Goals

**Goals:**

- A directed arrow between any two nodes that are not the same node and not parent and child, in the same tree or across trees
- Arrows sync, undo, persist, duplicate and export with the map
- No arrow outlives one of its nodes in stored state

**Non-Goals:**

- Labels, colors, line styles, arrowheads other than one at the target
- Manual routing or bending
- Presence for a selected arrow
- Mermaid output for arrows
- Repairing a dangling arrow in the live Y.Doc

## Decisions

### 1. An arrow is its own record, keyed by its endpoints

An arrow is `{ source, target }`, where `source` and `target` are node ids of the same map. It has no id of its own: its key is `arrowKey(source, target)`, which `packages/shared` defines as `` `${source}:${target}` ``. An arrow is immutable. Changing an endpoint means removing one arrow and adding another. The shared package adds `MapArrow`, its valibot schema and `arrowKey` next to `MapNode`.

Deriving the key from the endpoints makes a duplicate unrepresentable. Two peers that create the same arrow at once write the same key, Yjs keeps one value, and one delete removes it for both. Undo of a concurrent create on one peer removes the arrow for the other peer too, which is correct because it is the same arrow.

**Alternative rejected:** a random id per arrow. Two concurrent creates would yield two live records drawn on top of each other, and deleting one would leave the other visible.

**Alternative rejected:** a `targets: string[]` field on the source node. Two clients adding arrows from the same node at once would both rewrite the array, and Yjs keeps one of the two writes.

### 2. `Y.Map("arrows")` next to `Y.Map("nodes")`

The Y.Doc gains a top-level `Y.Map("arrows")`, keyed by `arrowKey`, each value a `Y.Map` holding `source` and `target`. `Y.UndoManager` takes `[nodesMap, arrowsMap]` as its scope, so one undo step covers a node removal and the arrows it took along.

Local writes:

- **Create and remove an arrow** write one key in a `doc.transact` call with the local origin.
- **Node remove and cut** delete the node, its descendants and every arrow attached to any of them in one transaction.
- **Paste** writes the pasted nodes and their inner arrows in one transaction.
- **Import** clears `arrowsMap` and writes the imported arrows in the same transaction as the node replacement.
- **Redistribute** leaves `arrowsMap` untouched. It keeps every node id, so every arrow stays valid.

Remote and undo writes: `YjsSyncService` observes `arrowsMap` with the same origin filter as `nodesMap`, so it applies peer writes and the local undo manager's writes and skips its own local ones. Each change applies by key and is idempotent: an add inserts the arrow into the renderer if absent, a delete removes it if present. `loadMapFromYDoc` loads nodes and arrows, so the arrow events of a full-map replacement are no-ops once the node observer has reloaded the map. No ordering between the two observers is needed, because the renderer holds an arrow whose endpoint it lacks (decision 3).

A peer can add an arrow to a node while another peer removes that node. Yjs merges both, and the arrow's endpoint then names a missing node. Such a **dangling arrow** stays in the Y.Doc until the server unloads and hydrates the map again. Every client holds it and draws nothing, persistence leaves it out (decision 4), and an undo that restores the node makes it draw again on every client. No client and no server deletes it from the Y.Doc, because a repair would race with that undo.

### 3. Rendering in `packages/mmp`

`Draw` gains an arrow layer, an SVG group between the branch group and the node group, so arrows cross branches and pass under nodes. Each arrow is one path:

- a quadratic curve from the source node's center to the target node's center, bent to the side by a fixed fraction of its length, so that an arrow parallel to a branch stays distinguishable
- clipped at both node rectangles, reusing the node dimensions `node-geometry.ts` already computes
- dashed, in a neutral color that reads in both themes, with an SVG `marker-end` arrowhead defined once per map

The renderer keeps every arrow it is given, whether or not both endpoints exist. It draws an arrow only while both endpoints exist and are visible, and it re-evaluates an arrow whenever one of its endpoints is added, removed, hidden or shown.

Arrows redraw on node geometry, not on the operation that changed it. The renderer redraws the arrows attached to a node from every place that changes the node's position or size:

- the coordinate setter behind `updateNode('coordinates')`, which a local drag, a peer's move and an undo all go through
- `moveNodeTo`, which redistribute uses, followed by one pass over every arrow as with branches
- `Draw.updateNodeShapes`, which runs after a name, font, image or link change resizes the node
- the hidden-state toggle
- `Draw.update`, which redraws every arrow

During a drag of a locked node the descendants move with it, and their arrows redraw with them.

`packages/mmp` exposes `addArrow`, `removeArrow`, `selectArrow`, `getArrows` and `arrowKey` through its entry point, and emits `arrowCreate`, `arrowRemove` and `arrowSelect` events that `MmpService` forwards to `YjsSyncService`, as it does for nodes. `addArrow` and `removeArrow` take `notifyWithEvent`, as `addNodes` and `removeNode` do, so the sync service can apply remote writes without echoing them.

### 4. Storage in `mmp_arrow`

A new entity `MmpArrow`:

| Column         | Type | Notes                                                                          |
| -------------- | ---- | ------------------------------------------------------------------------------ |
| `nodeMapId`    | uuid | foreign key to `mmp_map`, cascade on delete                                    |
| `sourceNodeId` | uuid | with `nodeMapId`, foreign key to `mmp_node (nodeMapId, id)`, cascade on delete |
| `targetNodeId` | uuid | as `sourceNodeId`                                                              |

The primary key is `(nodeMapId, sourceNodeId, targetNodeId)`, which is the arrow key and backs the duplicate rule. The composite foreign keys make a cross-map arrow and a dangling arrow impossible in the database.

Persisting runs in the existing transaction, after the node upsert: delete every `mmp_arrow` row of the map, then insert the arrows of the Y.Doc. The rewrite is independent of what the previous save stored, so a surviving arrow never collides with its own row, and an arrow removed between two surviving nodes leaves the database. Before inserting, the service leaves out every arrow whose endpoint is not among the nodes being written, which excludes the orphans the node save already leaves out, and every entry whose key is not `arrowKey(source, target)` of its own fields. It logs each left-out key at debug level, because a dangling arrow is a normal transient state and repeats on every save until the next hydration.

Hydration loads the map's arrows with its nodes and fills `Y.Map("arrows")`.

The REST side carries arrows beside nodes. `ClientMap` in `packages/shared` gains `arrows: MapArrow[]`. `MapsService.exportMapToClient` returns them, so the map read, the create response and the duplicate response include them. Duplication copies the arrow rows with the new map id and unchanged node ids, after the nodes. `MapsService.updateMap` inserts `clientMap.arrows` after the nodes; deleting the nodes cascades to the old arrows first.

**Alternative rejected:** a JSON column on `mmp_map`. It would need no migration, but nothing would stop an arrow from naming a removed node, and deleting a node would leave stale entries in the column.

### 5. Endpoint rules, enforced in one place

`packages/shared` gains `canConnect(nodes, arrows, source, target)` returning a reason or `null`. It refuses:

- `source === target`
- an existing arrow with the same `source` and `target`
- `source` being the parent of `target`, or `target` the parent of `source`

An arrow from B to A beside one from A to B is allowed; the two say different things and have different keys. The renderer calls `canConnect` before it creates an arrow and marks refused targets in arrow mode. JSON import drops every arrow `canConnect` refuses.

A peer can make an existing arrow break the parent rule by moving one endpoint under the other. The arrow stays and is drawn; the rules apply only at creation and import.

### 6. Arrow mode

Arrow mode is renderer state, not map state. It starts from the toolbar button or `alt+a` while a node is selected and the client is writable. With nothing selected the button is disabled like every node-specific toolbar button, and `alt+a` does nothing. Arrow mode shows a dashed preview from the source to the pointer.

A click on a node in arrow mode:

- on an allowed node creates the arrow, ends arrow mode and selects the source again
- on a refused node, the source included, creates nothing, shows the reason as a toast and stays in arrow mode

Arrow mode ends and creates nothing on:

- Escape, a click on empty space, or the arrow button again
- the source node being removed or hidden, locally or by a peer
- a full-map replacement
- the client losing write access

While arrow mode is active, every map shortcut except Escape is ignored, nodes cannot be dragged, and a click on another toolbar button ends arrow mode before the button acts.

### 7. Arrow selection and removal

A click on an arrow's path, widened by a transparent stroke for a usable hit area, selects the arrow and sets the selected node to `null`, the empty selection `support-multiple-trees` introduces, so presence broadcasts no selected node. Node selection and arrow selection exclude each other: selecting a node clears the arrow selection, and a click on empty space clears both. A peer removing the selected arrow, or an endpoint of it, clears the selection.

The remove action covers `-`, `backspace`, the new `delete` binding and the toolbar remove button. It removes the selected arrow while one is selected, and the selected node otherwise. `delete` joins the existing remove shortcut, so it removes a node too. While an arrow is selected, shortcuts that need a selected node do nothing.

A read-only client draws arrows and can neither enter arrow mode nor select an arrow.

### 8. Copy, cut and paste

`CopyPaste` copies the arrows whose source and target both lie in the copied subtree, and paste writes them between the pasted nodes, keyed by the pasted node ids. This holds for every paste target: under the selected node, and as an independent tree when nothing is selected. Copying a root other than the main root copies the arrows inside its tree. An arrow with one endpoint outside the subtree is not copied. Deleting a root removes its tree and every arrow attached to it. Cut removes the subtree and every arrow attached to it, as remove does.

### 9. JSON export format

JSON export writes `{ "nodes": MapSnapshot, "arrows": MapArrow[] }`. JSON import accepts that object and the bare node list older versions wrote, which imports with no arrows. `MapSnapshot` itself stays a node list, so Mermaid import, AI generation and the paths that only move nodes stay unchanged. `importMap` takes an optional arrow list, and mmp replaces its arrows with that list, which is empty when the caller passes none. Mermaid import and AI generation therefore clear the map's arrows, as they clear its nodes.

A file exported by this version does not import into an older TeamMapper. The release notes say so.

Mermaid `mindmap` syntax has no relation other than parent and child, so Mermaid export drops arrows. SVG, PNG, JPEG and PDF export the drawn SVG, so they include arrows with no extra work.

### 10. Rollout

The `arrows` flag in `SystemFeatureFlags` gates only arrow mode: the toolbar button and `alt+a`. Storage, sync, rendering, selection and export ship first and unflagged, so a map created on an instance with the flag on keeps its arrows when opened on one with the flag off, and a rollback of the frontend leaves stored arrows intact. The last PR removes the flag.

## Risks / Trade-offs

- **Dangling arrows in the Y.Doc** until the next hydration. They render as nothing and persist as nothing, so a user never sees one, and an undo that restores the node restores the arrow with it.
- **Arrow rewrite per save**: persistence deletes and inserts every arrow of the map on each save. A map holds few arrows, so this costs less than the node upsert that runs beside it.
- **Undo across peers**: undoing a node removal restores its arrows, but an arrow a peer created to that node in between is not restored if the peer's own undo removed it. This matches how undo treats nodes today.
- **Clutter**: many arrows over a dense map cross nodes and each other. The dashed style and the layer under the nodes keep names readable, and routing stays a non-goal.
- **Old importers**: new JSON files do not import into older versions.
