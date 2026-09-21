# Glossary

The words TeamMapper uses for its own concepts. Use these terms in code,
comments, commit messages, issues and documentation, so that one concept keeps
one name.

Mind mapping has settled vocabulary, so most entries below use the ordinary
words. A few concepts have no common name and the app coined one; those entries
say so.

## Words to avoid

| Do not write                            | Write instead                              |
| --------------------------------------- | ------------------------------------------ |
| board, canvas, diagram, chart, document | mind map                                   |
| Mindmap, mindmap (one word)             | mind map                                   |
| card, box, bubble, topic, item          | node                                       |
| central topic, main idea, centre        | root node                                  |
| edge                                    | branch                                     |
| fold, collapse, unfold, expand          | hide, show                                 |
| clone, fork                             | duplicate                                  |
| version, revision, snapshot             | (none of these exist; see **Undo / Redo**) |

### Reserved

This glossary leaves **arrow**, **connector** and **line** undefined on purpose.
A mind map may one day draw a relation between two nodes that are not parent and
child, and whoever builds that feature can claim one of these words. Until then,
do not use any of them as a loose synonym for a branch.

## The model

### Mind map

The whole map: a root node, every node below it, and the map's settings. Write
"mind map" in prose, and **map** in identifiers and in URLs.

The product's own screens say "Mindmap" in most places and "mind map" in others.
Write "mind map".

### Node

One labelled unit in a mind map. A node holds a name, a position, colors and a
font, and it may hold an image and a link. Every node except the root has a
parent.

### Root node

The one node per map with no parent. The app creates it with the map, and no one
can delete, copy, cut or lock it. Every other node descends from it.

### Detached node

A node with no parent that the map still draws, and draws no branch to. The app
coined the term; mind mapping has no common word for it. Users create detached
nodes on purpose.

Do not confuse a detached node with an **orphaned node**, whose parent is
missing. An orphaned node is a fault in the data, and the app repairs it by
placing the node at the end of the map.

### Branch

The curve the app draws from a parent node to a child. A branch takes styling
only; no one selects or addresses one on its own. A branch can take its color
from the map's automatic branch colors setting instead of an explicit one.

### Link

A single web address attached to a node. The map draws it as an icon, or as
**linktext** when that setting is on: the address written out inline instead of
the icon. "Linktext" is the app's own compound.

### Image

An optional picture on a node. Always "image", never "picture" or
"attachment". A node holds at most one.

### Pictogram

A symbol from the ARASAAC library. You search the pictogram dialog by term and
insert the symbol as a node image. Not available on every server.

### Locked node

A node that drags its descendants along. Locking changes dragging only; it does
not prevent editing.

The toolbar calls this "groups or ungroups the node" and the root node's error
message calls it locking. Write "locked".

### Hidden node

A node the app does not draw because an ancestor's children are hidden. The map
does not store hiding: hiding is how one person is looking at the map right now.

Write "hide" and "show". Avoid "collapse" and "fold".

### Map settings

What a single mind map remembers about how the app draws it, chiefly the font
size range. Distinct from **user settings**, which are one browser's defaults
for the maps it creates: automatic branch colors, centering on resize, showing
linktext, and the starting name and styling for root nodes and ordinary nodes.

## What you can do to a map

### Add, remove, select, deselect

The four basic node operations. Adding takes a parent; adding a detached node
takes none. No one can remove the root node.

### Drag

Move a node by pointer. A locked node drags its descendants along.

### Redistribute

Recompute the layout of every node in the map at once, spreading the tree
evenly. Distinct from dragging one node. The app coined the term; the toolbar
calls it distributing all nodes evenly.

### Copy, cut, paste

Clipboard operations over a node and its whole subtree. No one can copy or cut
the root node.

### Undo / Redo

Step backwards and forwards through your own edits. Undo reverts only the
changes you made, never a collaborator's.

TeamMapper keeps no version history. Nothing stores earlier states of a map,
and there is no restore.

### Zoom, center

Scale the view, and move the root node back to the middle of the viewport.

### Import

Replace the whole map from an external source: Mermaid mindmap syntax, or a
JSON export. Import discards the current content rather than merging.

### AI generate

Describe a mind map in prose and have the server write Mermaid syntax for it.
The app then imports that syntax the normal way. Not available on every server.

### Export

Write the map out. Six formats: JSON, Mermaid, SVG, PNG, JPEG and PDF.

### Duplicate

Copy a whole map to a new one with a new address and new secrets. Never "clone"
or "fork".

## Sharing and collaboration

### Writable

Whether a connection may edit. The app stores one flag; read-only is its
negation. A connection is writable when it presents the map's modification
secret.

### Viewer link, editor link

The two addresses the share dialog hands out. The viewer link opens the map
read-only. The editor link is the same address with the modification secret
appended after a `#`, which keeps the secret out of anything the server records.

The share dialog itself labels these "only observe" and "observe and modify".

### Modification secret

The secret that grants editing. The app generates it with the map, and the
editor link carries it.

### Admin id

The app generates a second secret with the map, and that secret authorizes
deleting the map. TeamMapper has no user accounts, so the admin id is neither an
account nor a login. Holding it is what makes you a map's owner, and a browser
remembers the maps it created.

### Client

One open connection to a map, not a person: two tabs are two clients.

### Client list, client color

The **client list** is everyone connected to a map right now. Each client gets a
**client color** from a fixed palette, which tints the ring around whichever
node that client has selected. Presence is anonymous, and a color is the only
identity anyone has.

### Presence

Who is on a map right now and what each of them has selected. The app sends
presence separately from the map's content, and losing presence does not lose
edits.

### Connection status

Whether this client reaches the server. Losing the connection raises the
"Connection lost" dialog with a reconnect button.
