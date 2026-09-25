## Why

People cannot discuss a node without changing it. They rename nodes to leave questions, or add child nodes that say "check this". Groupwriter stores comments in the Y.Doc, and TeamMapper syncs through Yjs as well, so comments can follow the same model.

## What Changes

- **Comment button**: a speech bubble button in the toolbar opens the comment panel for the selected node, with the input focused.
- **Comment panel**: a collapsible panel on the right lists the comments of one node, oldest first. It stays hidden until opened and follows the selected node while open.
- **Comment badge**: a node with comments shows a speech bubble badge on its left. Clicking it selects the node and opens the panel.
- **Edit and delete**: any writable client may edit or delete any comment. Every comment is anonymous.
- **Sync**: comments live in a new `Y.Map("comments")` and reach every client.
- **Removal and undo**: removing a node leaves its comments in the Y.Doc, as in groupwriter, and the client hides them. Undoing the removal shows them again.
- **Storage**: a new `mmp_comment` table. Persisting writes only comments whose node exists.
- **Duplication** copies the comments.
- **Stale client guard**: every Y.Doc the server builds from the rows gets a new generation id. A client reconnecting with an older generation is refused and reloads the map instead of merging an unrelated history. Interim until #1389.

## Non-goals

- User names or any identity on a comment.
- Replies, threads, resolving, reactions, mentions or notifications.
- Undo or redo of adding, editing or deleting a comment.
- Writing comments from read-only clients.
- Comments in JSON or Mermaid export and import, AI generation, or copy and paste.
- Rich text, images or links inside a comment.
- Storing the Yjs state in the database (#1389). Storage stays relational rows.

## Capabilities

### New Capabilities

- `node-comments`: adding, editing and deleting comments, the comment button, panel and badge, hiding comments of removed nodes and showing them again on undo

### Modified Capabilities

- `yjs-sync`: the Y.Doc holds a `comments` map, and the server refuses a client whose doc belongs to an earlier generation
- `yjs-persistence`: comments are persisted to and hydrated from a new table
- `yjs-bridge`: a map import clears the comments
- `yjs-undo`: the undo manager leaves the comments map untracked

## Impact

- **Shared types**: `MapComment` and its schema in `packages/shared`.
- **Storage**: a migration adds `mmp_comment`, keyed by comment id and map id, cascading on map deletion, with no foreign key to the node, because persistence rewrites the node rows.
- **Backend**: hydration, persistence and duplication handle comments, and the gateway checks the generation. Write access is unchanged: the server already refuses every update from a read-only client.
- **Renderer**: `packages/mmp` draws the badge and emits an event on click.
- **Frontend**: a comments service, the panel component, the toolbar button and texts in every language.
- **Glossary**: entries for **Comment**, **Comment badge** and **Comment panel**.
