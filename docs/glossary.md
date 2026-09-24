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
| central topic, main idea, centre        | main root                                  |
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

The whole map: one or more trees and the map's settings. Write
"mind map" in prose, and **map** in identifiers and in URLs.

The product's own screens say "Mindmap" in most places and "mind map" in others.
Write "mind map".

### Node

One labelled unit in a mind map. A node holds a name, a position, colors and a
font, and it may hold an image and a link. Every node except a root node has a
parent.

### Tree

A root node and every node that descends from it. A map holds one or more
trees, and each tree has its own layout around its root node.

### Root node

A node with no parent. Each root node starts a tree, and the map draws no
branch to it. A map holds at least one root node, the main root.

### Main root

The one root node per map that the app creates with the map. No one can delete,
copy, cut or lock it. The stored flag `isRoot` marks the main root only, so do
not read `isRoot` to learn whether a node has a parent.

### Orphaned node

A node that no root node reaches, because its parent is missing or its
ancestors form a cycle. An orphaned node is a fault in the data. The layout
parks it in a column right of every tree and starts no tree at it. The backend
leaves every orphaned node out when it saves a map or duplicates one, logs the
node IDs, and deletes their rows, because the parent foreign key rejects them.

Do not call a parentless node an orphaned node: a node with no parent is a root
node.

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
"attachment". A node holds at most one. A current frontend adds every image as
an **image reference**; existing maps, older clients and imports carry an
inline raster data URL. Exports write every image as a data URL.

### Image reference

The value `image:<uuid>` a node holds for an image the server stores for its
map. The server generates the uuid per upload; the map and the uuid together
name the image, so a duplicated map resolves the same references. Never
"image id" for the whole value: the image id is the uuid alone.

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

### Info dialog

The dialog that the info button or `?` opens over the map. It shows the app
version, the map's deletion date and the delete action, and below them every
keyboard shortcut. Map shortcuts do not act while it is open.

## What you can do to a map

### Add, remove, select, deselect

The four basic node operations. Adding takes a parent. Adding a tree takes
none: the toolbar's "add tree" button creates a root node clear of the other
trees. Removing a node removes its descendants with it, so removing a root node
removes its tree. No one can remove the main root.

Deselecting leaves no node selected, the main root included. With nothing
selected, the operations on the selected node do nothing, and the toolbar
and the floating buttons disable them. Paste is the exception: it adds a tree
(see Copy, cut, paste). A map load selects the main root.

### Drag

Move a node by pointer. A locked node drags its descendants along.

### Redistribute

Recompute the layout of every node in the map at once, spreading the tree
evenly. Distinct from dragging one node. The app coined the term; the toolbar
calls it distributing all nodes evenly.

### Copy, cut, paste

Clipboard operations over a node and its whole subtree. No one can copy or cut
the main root. With nothing selected, paste adds the copied nodes as a new tree
clear of the other trees. No pasted node becomes the main root.

### Undo / Redo

Step backwards and forwards through your own edits. Undo reverts only the
changes you made, never a collaborator's.

TeamMapper keeps no version history. Nothing stores earlier states of a map,
and there is no restore.

### Zoom, center

Scale the view, and move the main root back to the middle of the viewport.

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
