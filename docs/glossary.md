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
| flag, mark (for a stored value)         | attribute                                  |

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
copy or cut it. The stored attribute `isRoot` is true for the main root only,
so do not read `isRoot` to learn whether a node has a parent.

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

A single http or https address attached to a node. The map draws it as an
icon, or as **linktext** when that setting is on: the address written out inline
instead of the icon. "Linktext" is the app's own compound.

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

### Protected branch

A node and every node below it, which a user declares finished to tell others
not to change them. The app sets the attribute `protected` on the top node of
the branch only and draws a lock badge on that node. A node counts as protected
when its own `protected` attribute or an ancestor's is true. Any writable
client protects a branch or releases it again from the toolbar's lock button,
and the attribute syncs to every client.

A protected branch refuses local edits: rename, style, image, link, drag, add
child, paste, remove and cut. Peer writes, undo, redo, redistribute and import
still apply. The server enforces nothing, so any user who can edit the map can
release the branch and edit it.

Write "protect" and "release". Avoid "lock" for the concept, and "freeze" or
"read-only", which name a client that cannot write.

### Hidden node

A node the app does not draw because the view state hides the child nodes of
one of its ancestors. The app also hides a node a peer adds below such an
ancestor. A hidden node keeps its room in the layout.

Write "hide" and "show". Avoid "collapse" and "fold".

### View state

The set of nodes whose child nodes one person has hidden. mmp keeps the view
state apart from the map data, so the undo stack never records it. The
frontend sends no record of which child nodes are hidden to the server or to a
peer, and stores none, so a reload shows them again. The view state starts
empty each time the app opens a map.

### Selection, ring

The **selection** is the one node a client has selected. mmp draws a **ring**
around it, and around each node a peer has selected, in that peer's client
color. Each client keeps its own selection apart from the map data and from
the view state. Peers see it through Yjs awareness (see **Presence**).

### Map settings

What a single mind map remembers about how the app draws it, chiefly the font
size range. Distinct from **user settings**, which are one browser's defaults
for the maps it creates: automatic branch colors, centering on resize, showing
linktext, and the starting name and styling for root nodes and ordinary nodes.

### Info dialog

The dialog that the info button or `?` opens over the map. It shows the app
version, a hint that the map's deletion date moved to the settings, and every
keyboard shortcut. Map shortcuts do not act while it is open.

### Deletion card

The card at the top of the Map options tab in the settings. It shows the open
map's deletion date and the server's retention period, and gives the map's
admin the delete action. The map list, which the settings' third tab and the
start page both show, offers the same delete action for every listed map whose
admin id the browser holds, open or not.

### Node mark

One visual element of a drawn node: its background, name, image, link, hidden
eye icon or lock badge. The renderer in `packages/mmp` draws every node from
the marks in `NODE_MARKS`, so a new visual element is a new mark. The term
follows the visualization sense of a mark: a visual element bound to one data
item. A mark can consist of several DOM elements, such as the link's `<a>` and
`<text>`. Write "DOM element" or the tag name when you mean the browser object,
and "node group" for the `<g>` that holds all marks of one node.

## What you can do to a map

### Add, remove, select, deselect

The four basic node operations. Adding takes a parent. Adding a tree takes
none: the toolbar's "add tree" button creates a root node at the nearest spot
to the middle of the viewport that keeps clear of the other trees, and selects
it. Removing a node removes its descendants with it, so removing a root node
removes its tree. No one can remove the main root.

Deselecting leaves no node selected, the main root included. With nothing
selected, the operations on the selected node do nothing, and the toolbar
and the floating buttons disable them. Paste is the exception: it adds a tree
(see Copy, cut, paste). A map load selects the main root.

### Drag

Move a node by pointer. A node drags its descendants along. A protected node
does not move.

### Redistribute

Recompute the layout of every node in the map at once, spreading the tree
evenly. Distinct from dragging one node. The app coined the term; the toolbar
calls it distributing all nodes evenly.

### Copy, cut, paste

Clipboard operations over a node and its whole subtree. No one can copy or cut
the main root. With nothing selected, paste adds the copied nodes as a new tree.
The client picks the spot for the pasted tree the way it picks one for an added
tree, clear of the other trees, and pans the view to show the pasted tree. The
paste leaves the selection empty, so a second paste adds a second tree. No
pasted node becomes the main root.

### Undo / Redo

Step backwards and forwards through your own edits. Undo reverts only the
changes you made, never a collaborator's.

TeamMapper keeps no version history. Nothing stores earlier states of a map,
and there is no restore.

### Zoom, center

Scale the view, and move the main root back to the middle of the viewport.

### Viewport

The part of the map one client shows on screen. Zooming and panning
change the viewport; they change no node's coordinates. Each client has its own
viewport, so a collaborator may not see a tree you just added.

### Import

Replace the whole map from an external source: Mermaid mindmap syntax, or a
JSON export. Import discards the current content rather than merging.

### AI generate

Describe a mind map in prose and have the server write Mermaid syntax for it.
The app then imports that syntax the normal way. Not available on every server.

The request may set the map's shape: **levels**, the node levels below the
main root (1 to 3, default 2), and **children per node**, the most child nodes
any node gets (1 to 4, default 4). A shape may ask for at most 20 nodes below
the main root, so 3 levels allow at most 2 children per node. The server drops
every node the LLM writes beyond that shape, along with its descendants, and
never adds a node the LLM omitted. When the LLM runs out of output tokens, the
app warns the user and imports whatever part of the map arrived.

### Export

Write the map out. Six formats: JSON, Mermaid, SVG, PNG, JPEG and PDF.

### Duplicate

Copy a whole map to a new one with a new address and new secrets. Never "clone"
or "fork".

### Image cap

The maximum stored image bytes one map may hold through image uploads or
duplication. Existing inline images and the image extraction job can exceed it.

### Duplication storage budget

The maximum stored image bytes across all maps under which duplication may
add image bytes. Counts image references' stored image sizes and inline image
data URLs' UTF-8 bytes. Copies of copies consume the same budget. Distinct from
the image cap, which limits the images of a single map.

## Sharing and collaboration

### Writable

Whether a connection may edit. The app stores one boolean attribute, and
read-only is its negation. A connection is writable when it presents the map's modification
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

## Words for code

### Attribute

A value a data object holds, such as a node's `isRoot`, `protected` or
`name`. A boolean attribute is still an attribute: write "the `isRoot`
attribute is true", not "the node carries the root flag".

### Attribute group

A set of related node attributes that a node record holds under one key:
`colors`, `font`, `image` and `link`. The Y.Doc stores each attribute group
as a nested Y.Map with one key per attribute. When you change the background
color while a peer changes the name color, your clients write different keys
and both colors survive the merge. The frontend and the backend also read a
group that a peer stored as a plain object.

### Flag

A switch that configures the app from outside its data: an environment
variable, a feature flag or a command-line option. A value stored on a node or
a map is an attribute.

### Map data

The nodes of one mind map as every client shares them. The app draws the map
from the map data and keeps no copy of its own, so your edits, a peer's edits
and an undo all change the map data first, and the app then redraws.

In the app, the map data syncs with the server and the other clients. The
mmp specs use `InMemoryMapData`. The **view state** and the
**selection** stay with one person and never enter the map data.

### Mark

Reserved for the **node mark**, one visual element of a drawn node. Do not use
"mark" for a stored value: a node holds an attribute, it does not carry a mark.
