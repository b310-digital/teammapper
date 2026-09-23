## Context

A node carries a `locked` flag today. In `packages/mmp` it changes dragging only: `Drag.dragged` moves the descendants along when the dragged node is locked. New nodes start locked (`options.ts`), JSON and Mermaid import set it on every non-root node, and the toolbar toggles it with a "group / ungroup" button showing the `select_all` and `deselect` icons. The flag travels everywhere a node property does: `UserNodeProperties`, its valibot schema, `mmp_node.locked`, the Y.Doc node entry, the legacy history format and JSON export.

Every edit of a node goes through a few entry points in `packages/mmp`: `Nodes.updateNode`, `Nodes.addNode`, `Nodes.removeNode`, the drag handler, and `CopyPaste.cut` and `paste`. Remote writes from `YjsSyncService` and undo writes reach the same entry points with `notifyWithEvent` set to `false`.

The app has no user accounts and no multi-selection. A client is writable or read-only, nothing finer.

## Goals / Non-Goals

**Goals:**

- One action protects a node and its whole subtree against accidental edits, on every client
- Any writable client can release the protection
- The old locked toggle disappears without changing how a drag feels for new maps

**Non-Goals:**

- Enforcement on the server
- Per-client or per-person ownership of a protection
- Blocking undo, redo, redistribute or import

## Decisions

### 1. Remove `locked`, drag always moves descendants

`Drag.dragged` and `Drag.ended` drop the `node.locked` check and always move and report the descendants. This is how every new node already behaves, because nodes start locked. Maps where someone ungrouped a node change: dragging that node now moves its children too.

The field leaves `UserNodeProperties`, the node schema, `normalizeMapData`, the Y.Doc conversion on both sides, `clientServerMapping`, the seed job, `import.service.ts` and the mmp options. A migration drops `mmp_node.locked`. The legacy history reader stops mapping `fixed` to `locked`. JSON import accepts files that still carry `locked` and drops the field, because `v.object` strips unknown keys.

**Alternative rejected:** reuse `locked` as the protection flag. Almost every stored node carries `locked: true`, so every existing map would open fully protected.

### 2. One `protected` flag on the top node of a branch

A node gains `protected: boolean`. The schema declares it `v.optional(v.boolean(), false)`, so older JSON files import unprotected. A node is **protected** when it or any ancestor carries the flag. The flag sits on the top node only, so protecting a branch is one write and a peer adding a node below it needs no extra write.

The shared package adds `protectingNode(nodes, id)`, which walks up the parents and returns the id of the nearest ancestor-or-self with the flag, or `null`. Both the renderer and the toolbar use it.

At most one flag lies on any path from a root to a leaf:

- Protecting a node that is already protected is not offered: the button shows "release".
- Protecting a node clears the flag on every descendant in the same transaction.

Releasing from any node of a protected branch clears the flag on `protectingNode`, which releases the whole branch in one write.

The main root can be protected. That protects its whole tree.

### 3. The renderer refuses local edits only

Each local entry point in `packages/mmp` checks `protectingNode` before it acts and emits a `nodeProtected` event instead of writing:

| Action                           | Refused when                            |
| -------------------------------- | --------------------------------------- |
| rename, style, image, link, font | the node is protected                   |
| drag                             | the dragged node is protected           |
| add child, paste                 | the target parent is protected          |
| remove, cut                      | the node or any descendant is protected |

The check runs only when `notifyWithEvent` is true. Remote writes, undo and redo, redistribute and import skip it, so no client ever refuses a write another client already made, and the Y.Doc stays the one truth.

Dragging an unprotected ancestor moves a protected branch along unchanged in shape. Copy is allowed. A pasted copy starts unprotected. Hiding and showing stay allowed because they are per-client view state.

`MmpService` turns `nodeProtected` into a snackbar: "This branch is protected. Release the lock to edit it."

**Alternative rejected:** checking in `YjsSyncService` before the write. The renderer would already have changed the node locally, and rolling it back would flicker.

### 4. Toolbar button and badge

The removed group button's slot takes the protection button:

```
 selected node       button        tooltip
 ---------------     ----------    -----------------------
 not protected       lock          Protect this branch
 protected           lock_open     Release protection
 none / read-only    disabled      (as above)
```

`Draw` renders a small lock badge in the top right corner of the node carrying the flag, in the node's name color. Descendants show no badge, so a large branch stays readable. The badge redraws when `protected` changes locally or remotely.

### 5. Sync, storage, undo

- The Y.Doc node entry gains `protected` and drops `locked`. Old Y.Docs are never persisted across a deploy, since every Y.Doc hydrates from the database.
- `mmp_node.protected` is `boolean NOT NULL DEFAULT false`. The entity column follows the repository's definite-assignment rule.
- Protect and release are local writes with the tracked origin, so undo reverts them.
- Map duplication and JSON export copy the flag. Mermaid export drops it, Mermaid import writes none.

## Risks / Trade-offs

- **Undo can edit a protected branch** → accepted. Undo only reverts one's own edits, and blocking it would leave the undo stack stuck.
- **A peer can edit just before the protection arrives** → accepted. Protection is a hint, Yjs merges both writes.
- **Maps with ungrouped nodes drag differently** → accepted. The toggle was hard to understand, and the new behavior matches the default.
- **The API still accepts edits on protected nodes** → accepted and stated in the non-goals.

## Migration Plan

One migration drops `locked` and adds `protected`. Its down migration restores `locked` as nullable and drops `protected`. No data is converted.
