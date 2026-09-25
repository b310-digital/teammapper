## Context

Every map has one Y.Doc on the server with a `nodes` map and a `mapOptions` map. `YjsSyncService` in the frontend owns the client Y.Doc, writes local node edits with the origin `'local'` and runs a `Y.UndoManager` on `nodes` that tracks only that origin. The server decodes the Y.Doc into `mmp_node` and `mmp_map` on a debounce and on the last disconnect, rewriting all node rows of the map each time, and hydrates a new Y.Doc from those tables. The server already drops every update from a read-only client.

Groupwriter keeps its comments in a `Y.Map("comments")` keyed by comment id, apart from the text they mark. Deleting marked text leaves the comment in that map, so undoing the deletion brings the mark and its comment back without any comment write. Comment writes stay out of the editor history.

The app has no user identity, and this change adds none.

## Goals / Non-Goals

**Goals:**

- Anonymous comments on a node that sync to every client and survive a reload
- Removing a node hides its comments and undo shows them again, for local and remote undo alike
- No change to the undo scope, to the node entry or to write access

**Non-Goals:**

- Authors, replies, resolving, notifications
- Undo of comment actions
- Comments in export, import, AI generation or copy and paste
- Storing the Yjs state in the database (#1389)

## Decisions

### 1. A flat `comments` map beside `nodes`

The Y.Doc gains `Y.Map("comments")`, keyed by comment id. Each value is a plain object `MapComment { id, nodeId, text, createdAt, updatedAt }`, times in epoch milliseconds. An edit replaces the whole value, so concurrent edits resolve last writer wins, which is enough for short plain text.

`MapComment` and its valibot schema live in `packages/shared`: `text` is a trimmed string of 1 to 2000 characters, `nodeId` and `id` are uuids. Both the frontend before writing and the backend before persisting validate against it. The panel renders the text through Angular interpolation, so no markup is ever interpreted.

**Alternative rejected:** a `comments` field on the node entry. Every comment edit would then rewrite a node entry, pass through the node observer and the undo scope, and grow `ExportNodeProperties`, which JSON export and the database mirror.

### 2. Removing a node keeps its comments, the client filters them

This follows groupwriter. Removing a node does not touch the `comments` map. The client shows a comment only while `nodes` holds its `nodeId`. An undo of the removal restores the node entry, and the same filter shows the comments again. Redo, cut and a peer's removal work the same way, with no extra code.

Comment writes use the origin `'comment'`, which the undo manager does not track, and the undo manager keeps tracking `nodes` only. Undo never writes a comment.

**Alternative rejected:** delete the comments in the removal transaction and add `comments` to the undo scope. Undo would then restore them, but every comment write would need an untracked origin to stay out of history, a paste of a cut node would have to decide whether to take the comments along, and an import undo would restore comments of a map that no longer exists.

### 3. Persistence writes only comments whose node exists

A new entity `MmpComment` maps to `mmp_comment`: `id uuid`, `nodeMapId uuid`, `nodeId uuid`, `text varchar(2000)`, `createdAt`, `updatedAt`, primary key `(id, nodeMapId)`, and a foreign key to `mmp_map` with `ON DELETE CASCADE`. It has no foreign key to `mmp_node`, because each persist deletes and reinserts the node rows.

In the same transaction as the nodes, persistence deletes the map's comment rows and inserts every entry of `comments` whose node is in `nodes` and that passes the schema. The Y.Doc keeps the other entries, so an undo in the same session still works and the next persist writes them back. Once the last client leaves, the Y.Doc is discarded and the comments of removed nodes are gone for good, along with every undo stack that could have restored them.

Hydration adds one entry per comment row. Map duplication copies the rows next to the nodes, keeping the ids, as nodes keep theirs. Map deletion and the cleanup of outdated maps remove comments through the cascade.

### 4. Import clears the comments

A JSON, Mermaid or AI import replaces all nodes with new ones inside one `'import'` transaction. The same transaction clears `comments`, because none of the old node ids survive and the import is not undoable.

### 5. The renderer draws the badge, the app owns the rest

`packages/mmp` knows nothing about comments. It gains `setCommentCounts(counts: Map<string, number>)`, which draws a speech bubble badge left of each node with a count above zero and removes it elsewhere, and a `commentBadgeClick` event carrying the node id. The badge carries its own class, and `Export` removes every element of that class from the clone it renders, next to where it already rewrites icons and `foreignObject` nodes. Hidden nodes are not drawn, so their badges are not either.

In the frontend a `CommentsService` reads `YjsSyncService.doc`, observes `comments` and `nodes`, and exposes the visible comments per node as a signal. On every change it calls `setCommentCounts`. It offers `add`, `edit` and `remove`, each one transaction with the origin `'comment'`, and refuses to write on a read-only client.

### 6. The comment panel

`CommentPanelComponent` sits in the application layout on the right, above the map and outside the toolbar. Its open state lives in the `CommentsService`, not in the map or the Y.Doc, so each client opens and closes it on its own. It opens from the toolbar's comment button, which focuses the input, and from `commentBadgeClick`, which selects the node first. While open it shows the comments of the selected node from `MmpService`, or a hint when nothing is selected.

The input is a textarea. `angular2-hotkeys` ignores key events from inputs and textareas by default, and the renderer's own keyboard handling listens on the map only, so typing in the panel cannot remove or add nodes. The spec keeps a scenario for this because a regression would destroy data.

The toolbar gains a button with the Material `comment` icon, disabled without a selection and on read-only clients. Texts go into all nine language files.

### 7. A generation id guards against merging a rebuilt doc

The server builds a Y.Doc from rows whenever it holds none: after the 30 s eviction and after a restart. The rebuilt doc has the same content but new Yjs identities. y-websocket reconnects with the client's old doc and pushes it into the new one, which brings back nodes and comments deleted in the meantime and reverts parallel edits at random.

Storing the Yjs state (#1389) fixes this at the root and stays out of scope, so storage remains plain rows. Until then:

- `YjsDocManager` creates a `uuid` v4 per hydration, keeps it in the doc entry and writes it to `meta.generation`.
- After the first sync `YjsSyncService` sets `provider.params.generation`. y-websocket 3 rebuilds its URL from `params` on every reconnect, so no provider swap is needed.
- The gateway reads the parameter next to `mapId` and `secret`. On a mismatch it closes with `WS_CLOSE_STALE_DOC = 4009` before `setupSync`, so not one sync message is exchanged.
- The client reloads the page on 4009, like on `WS_CLOSE_MAP_DELETED`. Edits made while offline are lost, which is the price of refusing the merge.

The id is not a secret and grants nothing: it only has to differ between hydrations. The server compares against its own copy, so a client that overwrites `meta.generation` only makes other clients reload once.

**Alternative rejected:** check the generation inside the Y.Doc on the client. The client can read the new id only after the sync, and by then its old state has reached the server.

**Alternative rejected:** hydrate with a fixed Yjs client id so rebuilt docs match. That only matches a doc built the same way from the start, never one that users edited.

## Risks / Trade-offs

- **Comments of removed nodes live in memory until the session ends** → They are small and bounded by what users typed during the session. Persistence never writes them.
- **Last writer wins on concurrent edits** → An edit can overwrite a parallel edit of the same comment. Comments are short and edits rare.
- **Undo does not restore a deleted comment** → Stated as a non-goal. Deleting a comment is a deliberate action on one item.
- **A map that is open for days keeps its orphans** → Acceptable, they are dropped on the next full disconnect.
- **Offline edits are discarded on a generation mismatch** → Rare, since it needs a disconnect longer than the eviction grace period. Merging would silently corrupt the map for everyone instead. #1389 removes the case.

## Migration Plan

One migration creates `mmp_comment` and drops it on the way down. Existing maps start with no comments. Clients from before the change ignore the `comments` map, and their node removals still leave comments in place, so mixed versions during a rollout lose nothing. Clients from before the change send no `generation` and are accepted, so the stale client guard only takes effect once every tab has reloaded.
