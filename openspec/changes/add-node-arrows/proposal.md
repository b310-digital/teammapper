## Why

A mind map relates nodes through branches only, so every relation it shows is parent and child. Issue #1357 asks for arrows that connect independent nodes as a hint to the reader, without changing the tree.

## What Changes

- **Add the arrow**: a directed connection from a source node to a target node, drawn dashed with one arrowhead at the target. It never changes the tree.
- **Create an arrow from the toolbar**: with a node selected, the "connect with arrow" button or `alt+a` enters arrow mode, and a click on a second node creates the arrow. Escape, empty space, the button again or the source going away cancels.
- **Refuse meaningless arrows**: no arrow from a node to itself, no second arrow with the same source and target (arrows are keyed by their endpoints), and no arrow between a node and its parent.
- **Select and delete an arrow**: a click selects an arrow and leaves no node selected, and the remove shortcuts or button delete it.
- **Keep arrows consistent with their nodes**: removing a node or tree removes its arrows, copying copies the arrows inside, and an arrow follows its nodes and hides with them.
- **Sync, undo and persist arrows**: arrows live in their own `Y.Map("arrows")`, undo covers them, and the backend stores them in a new `mmp_arrow` table. REST, duplication and seeding carry them.
- **Export arrows**: JSON export writes nodes and arrows, JSON import also accepts the old node list, and image exports show the arrows. Mermaid has no syntax for them and drops them.

## Non-goals

- Labels, colors, line styles or widths on an arrow
- Arrows without a head, or with a head at both ends
- Bending, routing or dragging an arrow by hand
- Arrows that point to another map, or to a position without a node
- Showing another client's selected arrow in presence
- Writing arrows to Mermaid
- Changing layout or redistribution because of arrows

## Capabilities

### New Capabilities

- `node-arrows`: the arrow concept, creation, the endpoint rules, selection, deletion, rendering, and how arrows follow node remove, copy, paste, hide and undo

### Modified Capabilities

- `import-export`: JSON import and export carry arrows, Mermaid export drops them
- `yjs-sync`: the Y.Doc gains an `arrows` map
- `yjs-persistence`: persistence decodes and hydrates arrows through a new table
- `yjs-undo`: the undo manager tracks the `arrows` map, and arrow writes use the tracked origin

## Impact

- **Storage**: a new `mmp_arrow` table keyed by map, source and target, cascading from `mmp_node`.
- **Shared types**: `MapArrow`, `arrowKey` and `ClientMap.arrows`.
- **Renderer**: `packages/mmp` gains an arrow layer, arrow mode and arrow selection.
- **Feature flag**: an `arrows` flag in `SystemFeatureFlags` gates the toolbar button and the shortcut; everything else ships unflagged.
- **Multi-tree maps**: builds on `support-multiple-trees`, which ships first. Arrows connect nodes across trees and use its empty selection.
