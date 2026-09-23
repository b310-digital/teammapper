## Why

In a large collaborative mind map, a stray drag, rename or delete easily changes a finished branch. Issue #1334 asks for a way to mark a branch as done so that nobody changes it by mistake. The discussion on the issue settled on a soft lock: any client may protect a branch, and any client may release it again.

The toolbar already has a "lock" of a different kind. A **locked node** today drags its descendants along, the toolbar calls it "group", and users do not understand it. This change removes that toggle and gives the lock icon to protection.

## What Changes

- **Remove the old locked toggle**: dragging a node always moves its descendants along, which is today's default for new nodes. The button, the `locked` field and its column go away.
- **Protect a branch**: with a node selected, the toolbar's lock button protects that node and every node below it. The protection syncs to every client.
- **Block accidental edits inside a protected branch**: no rename, drag, style, image, link, remove, cut, add child or paste into it. A short notice says the branch is protected.
- **Release by anyone**: selecting any node of a protected branch turns the button into "release protection", and any writable client may press it. Releasing removes the protection of the whole branch.
- **Show the state**: the node that carries the protection shows a small lock badge, so every client sees which branches are protected.
- **Keep protection with the map**: protection is stored, undoable, carried by JSON export and import and by map duplication.

## Non-goals

- A hard lock or any permission, owner or role concept. Protection is a hint, and the server does not enforce it.
- Protecting several unrelated nodes in one action. The app has no multi-selection.
- Protecting a single node without its descendants.
- A keyboard shortcut for protection.
- Blocking undo, redo, redistribute or import. These are deliberate, map-wide actions.
- Writing protection to Mermaid.

## Capabilities

### New Capabilities

- `node-protection`: protecting and releasing a branch, what a protected branch refuses, the lock badge, sync and persistence of the flag

### Modified Capabilities

- `node-operations`: dragging always moves the descendants along
- `yjs-sync`: the node entry drops `locked` and gains `protected`
- `yjs-undo`: property fidelity covers `protected` instead of `locked`
- `import-export`: JSON import keeps protection and ignores the old `locked` field

## Impact

- **Storage**: a migration drops `mmp_node.locked` and adds `mmp_node.protected`, `NOT NULL DEFAULT false`. Existing maps start with nothing protected.
- **Shared types**: `locked` leaves `UserNodeProperties` and its schema, `protected` joins them, plus a helper that finds the node protecting a given node.
- **Renderer**: `packages/mmp` drops the locked branch in the drag handler, refuses edits inside a protected branch and draws the lock badge.
- **Frontend**: the toolbar button changes to lock and unlock icons with new labels in every language.
- **Glossary**: the **Locked node** entry is replaced by **Protected branch**.
