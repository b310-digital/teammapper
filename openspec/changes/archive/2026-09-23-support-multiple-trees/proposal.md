## Why

A map holds one tree. The toolbar offers an "add detached node" button, but a detached node takes no children, so it stays a standalone comment. A user who wants a second subject on the same canvas cannot build one.

The code reads the stored `isRoot` flag with two meanings: that a node has no parent, and that the node is the map's main root. The renderer, the Mermaid export and the paste path each read the flag with one of the two meanings, so they disagree about which node is the root as soon as a second node has no parent. Several renderer paths also measure positions from the single root the map knows, which gives no answer for a node in another tree.

## What Changes

- **Narrow the root flag**: a node is a **root** when it has no parent, and `isRoot` keeps its name but marks only the **main root**, the one node per map that no user can delete.
- **Every root takes children**, at any depth, including a root that arrives by sync or map load.
- **Lay out each tree the same way**: left and right branching, column spacing, alignment and branch colors around its own root. The client that creates a tree places it clear of the trees it holds, and a tree keeps its stored position afterwards.
- **Delete and copy whole trees**: deleting a root deletes its descendants, copying a root other than the main root copies its tree, and pasting attaches under the selected node or, with no node selected, creates an independent tree.
- **Allow an empty selection**: deselecting leaves no node selected instead of selecting the main root.
- **Write one Mermaid `mindmap` block per tree**, since the format allows a single root per block, and import each block as its own tree.
- **Retire the detached node**: the toolbar offers "add tree" in place of "add detached node". Every detached node already has no parent, so it becomes a root at its stored position, and a migration drops the `detached` column.
- **Order every node parent-first on save**, and leave out a node no root reaches instead of failing the whole save.

## Non-goals

- Dragging an existing branch out into its own tree
- Promoting a node to a root or demoting a root into a branch
- Renaming `isRoot` or moving the main-root mark from the node to the map
- Keeping trees apart after creation, when trees grow or two clients add trees at once
- Copying or cutting the main root
- Cross-tree links
- Per-tree map options

## Capabilities

### New Capabilities

- `multi-tree-maps`: root and main-root semantics, per-tree layout, placement and orientation, tree-scoped delete, copy and paste, parent-first ordering across roots, and the detached-node migration

### Modified Capabilities

- `mind-map-core`: the toolbar lists an "add tree" button in place of "add detached node", and deselecting leaves no node selected
- `node-operations`: add and remove apply to a root and its tree, and the add-tree button creates a root
- `import-export`: Mermaid export writes one block per tree, and Mermaid import reads one tree per block
- `yjs-sync`: a Y.Doc may hold several roots, and the full-map replacement guard reads the main-root mark only

## Impact

- **Storage**: several roots need no schema change. A node's parent reference is already optional, `mmp_node.root` keeps its name, and a detached node already carries `root = false` and no parent. The last migration drops the `detached` column.
- **Renderer**: interactive add, paste, drag and keyboard navigation measure sides from the map's single root today. Each needs the root of the node's own tree.
- **Shared algorithms**: root lookup and parent-first ordering assume a single root, so the save path and the sync observer need variants that walk every root.
- **Feature flag**: a `multiTree` flag gates the add-tree button and pasting as a tree. The frontend reads the flag, and `packages/mmp` reads none, so the per-tree layout ships unconditionally and leaves single-tree output unchanged. The tasks split into eight pull requests of about 500 lines each, and each ships on its own in the listed order. The last one removes the flag and retires the detached node together.
