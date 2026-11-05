# Glossary

This glossary gives each TeamMapper concept one name. Use these terms in code,
comments, commit messages, issues and documentation.

Most entries use the ordinary vocabulary of mind mapping. Where a concept has no
common name, the app coined one, and the entry says so.

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

**Arrow** names a relation between two nodes that are not parent and child. Do
not write **connector** or **line** for an arrow, and do not use any of the
three words for a branch.

## The model

### Mind map

The whole map: one or more trees plus the map settings. Write "mind map" in
prose, and **map** in identifiers and URLs.

The app's own screens say "Mindmap" in most places and "mind map" in others.
Write "mind map".

### Node

One labelled unit in a mind map. A node has a name, a position, colors and a
font, and can have an image and a link. Every node except a root node has a
parent.

### Tree

A root node and all its descendants. A map has one or more trees, and the
layout arranges each tree around its own root node.

### Root node

A node with no parent. Each root node starts a tree, and the map draws no
branch to it. Every map has at least one root node, the main root.

### Main root

The root node the app creates together with the map. Each map has exactly one,
and no one can delete, copy or cut it. The stored attribute `isRoot` is true for
the main root and false for every other node, other root nodes included. Do not
read `isRoot` to learn whether a node has a parent.

### Orphaned node

A node that no root node reaches, because its parent is missing or its
ancestors form a cycle. An orphaned node is a data fault. The layout places it
in a column to the right of all trees and starts no tree at it. When the backend
saves or duplicates a map, it leaves out every orphaned node, logs their node
IDs and deletes their rows, because the parent foreign key rejects them.

A node with no parent is a root node, never an orphaned node.

### Branch

The shape the app draws from a parent node to a child node, as the **branch
style** sets it. A branch has styling and nothing else: no one selects a branch
or edits one on its own. A branch takes its color from the child's branch
color, or from the automatic branch colors user setting.

### Branch style

The user setting that decides how this browser draws every branch:

- `tapered`, the default: a filled shape that narrows with depth
- `curved`: a thin stroked curve
- `straight`: a thin straight stroke from the parent's center to the child's
  center

The setting changes the drawing and nothing else, so collaborators can see one
map in different branch styles. The app never syncs the setting or stores it
with a map.

### Node color

A node holds three colors: the name color, the background color and the branch
color. Each one is a hex color, `#rgb`, `#rrggbb` or `#rrggbbaa`, or empty for
no color. A user sets them with the **color picker** in the color panel beside
the selected node. The color picker writes `#rrggbbaa` for every color, with
the transparency in the last two digits.

### Arrow

A directed connection from a source node to a target node in the same map. The
map draws an arrow as a dashed curve with an arrowhead at the target, above the
branches and below the nodes. An arrow changes no parent and no layout,
redistribution ignores it, and it has no name or style of its own.

The key `arrowKey(source, target)` identifies an arrow, so a map has at most one
arrow per source and target; the reverse direction is a second arrow. The map
refuses an arrow from a node to itself and an arrow between a node and its
parent. Removing a node removes its arrows. Copying nodes copies each arrow
whose source and target are both among the copied nodes.

**Arrow mode** starts at the selected node and creates an arrow to the node you
click next. A **dangling arrow** points at a node the map no longer contains,
because one peer removed the node while another added the arrow. The map draws
no dangling arrow, and the backend saves none.

### Link

One http or https address attached to a node. The map draws the link as an
icon, or as **linktext** when that user setting is on: the address written out
in place of the icon. "Linktext" is the app's own compound.

### Image

An optional picture on a node. Write "image", never "picture" or "attachment".
A node has at most one image. The current frontend adds each new image as an
**image reference**. Existing maps, older clients and imports carry an inline
raster data URL instead. Exports write every image as a data URL.

### Image reference

The value `image:<uuid>` that a node stores in place of the image data. The
server stores the image with the map and generates the uuid for each upload.
The map and the uuid
together identify the image, so a duplicated map resolves the same references.
Never write "image id" for the whole value: the image id is the uuid alone.

### Pictogram

A symbol from the ARASAAC library. You search the pictogram dialog by term and
insert a symbol as a node image. Some servers do not offer pictograms.

### Protected branch

A node and all its descendants, which a user declares finished to ask others
not to change them. The app sets the attribute `protected` on the top node
alone and draws a lock badge on that node. A node counts as protected when its
own `protected` attribute or an ancestor's is true. Any writable client protects
or releases a branch with the lock button in the toolbar, and the attribute
syncs to every client.

A protected branch refuses these local edits: rename, style, image, link, drag,
add child, paste, remove and cut. Peer writes, undo, redo, redistribute and
import still change it. The server enforces nothing, so any user who can edit
the map can release the branch and edit it.

Write "protect" and "release". Avoid "lock" for the concept, and avoid "freeze"
and "read-only", which name a client that cannot write.

### Hidden node

A node the app does not draw, because the view state hides the child nodes of
one of its ancestors. The app also hides a node that a peer adds below such an
ancestor. A hidden node still takes up its space in the layout.

Write "hide" and "show". Avoid "collapse" and "fold".

### View state

The set of nodes whose child nodes one person has hidden. mmp stores the view
state apart from the map data, so the undo stack never records it. The frontend
neither sends the view state to the server or a peer nor saves it, so a reload
shows all child nodes again. The view state starts empty each time the app
opens a map.

### Selection, ring

The **selection** is the one node a client has selected. mmp draws a **ring**
around that node, and around each node a peer has selected, in that peer's
client color. Each client stores its selection apart from the map data and the
view state. Peers see the selection through Yjs awareness (see **Presence**).

### Map settings

The settings one mind map stores about how the app draws it, such as the font
size range. **User settings** are one browser's defaults instead, for the maps
it creates:

- automatic branch colors
- centering on resize
- showing linktext
- the branch style
- the starting name and styling of root nodes and ordinary nodes

### Info dialog

The dialog that the info button or `?` opens over the map. The dialog shows the
app version, a note that the map's deletion date moved to the settings, the
legal links, and all keyboard shortcuts. Map shortcuts do nothing while the
dialog is open.

### Legal links

The imprint link and the privacy link, which the info dialog and the footer of
the start page show. The operator of an instance sets their targets as
`imprintUrl` and `privacyUrl` in the system settings, or with the environment
variables `IMPRINT_URL` and `PRIVACY_URL`. The app shows a legal link only when
the operator has set its target.

### Settings dialog

The dialog that the settings button or `alt+s` opens over the map, with these
tabs:

1. General: language and dark mode.
2. Map options: the deletion card, the map settings of the open map, and the
   user settings for new nodes, linktext and centering.
3. The map list.

The map stays visible behind the dialog and shows each change at once. Map
shortcuts do nothing while the dialog is open.

### Deletion card

The card at the top of the Map options tab in the settings dialog. The card
shows the open map's deletion date and the server's retention period, and
offers the map's admin the delete action. The map list, which the third
settings tab and the start page both show, offers the same delete action for
each listed map whose admin id the browser stores, open or not.

### Node mark

One visual element of a drawn node: its background, name, image, link, hidden
eye icon or lock badge. The renderer in `packages/mmp` draws each node from the
marks in `NODE_MARKS`, so a new visual element means a new mark. The term comes
from visualization, where a mark is a visual element bound to one data item. A
mark can consist of several DOM elements, such as the link's `<a>` and
`<text>`. Write "DOM element" or the tag name for the browser object, and "node
group" for the `<g>` that contains all marks of one node.

## What you can do to a map

### Add, remove, select, deselect

Adding a node needs a parent. Adding a tree needs none: the toolbar's "add
tree" button creates a root node at the free spot nearest to the middle of the
viewport, clear of the other trees, and selects it. Removing a node removes its
descendants, so removing a root node removes its tree. No one can remove the
main root.

Deselecting leaves no node selected, the main root included. With nothing
selected, the operations on the selected node do nothing, and the toolbar and
the floating buttons disable them. Paste is the exception: it adds a tree (see
**Copy, cut, paste**). Loading a map selects the main root.

### Drag

Move a node with the pointer. Its descendants move with it. A protected node
does not move.

### Redistribute

Recompute the layout of all nodes in the map in one step. Dragging moves one
node; redistributing places all of them. The app coined the term; the toolbar
describes it as distributing all nodes evenly.

### Copy, cut, paste

Clipboard operations on a node and its whole subtree. No one can copy or cut
the main root. With nothing selected, paste adds the copied nodes as a new
tree. The client places the pasted tree the same way as an added tree, clear of
the other trees, and pans the view to show it. The paste leaves the selection
empty, so a second paste adds a second tree. No pasted node becomes the main
root.

### Undo / Redo

Step backward and forward through your own edits. Undo reverts your changes and
never a collaborator's.

TeamMapper has no version history: nothing stores earlier states of a map, and
you cannot restore one.

### Zoom, center

Zoom scales the view. Center moves the main root back to the middle of the
viewport.

### Viewport

The part of the map one client shows on screen. Zooming and panning change the
viewport and leave all node coordinates unchanged. Each client has its own
viewport, so a collaborator may not see a tree you just added.

### Import

Replace the whole map with the content of an external source: Mermaid mindmap
syntax or a JSON export. An import discards the current content and never
merges.

### AI generate

Describe a mind map in prose and let the server write Mermaid syntax for it.
The app imports that syntax like any other Mermaid import. Some servers do not
offer AI generation.

The request can set the shape of the map:

- **levels**: the node levels below the main root, 1 to 3, default 2
- **children per node**: the most child nodes any node gets, 1 to 4, default 4

A shape can ask for at most 20 nodes below the main root, so 3 levels allow at
most 2 children per node. The server drops each node the LLM writes beyond the
shape, together with its descendants, and never adds a node the LLM left out.
When the LLM runs out of output tokens, the app warns the user and imports the
part of the map that arrived.

### Export

Write the map to a file as JSON, Mermaid, SVG, PNG, JPEG or PDF.

### Map file version

The whole number that names the layout of a JSON export, so an import knows
which rules to check the file against. Older releases and the Mermaid import
write version 1, a plain list of nodes. Its nodes may lack a link, the `isRoot`
attribute and a position, and the file contains no arrows. Version 2 contains
the version number, the nodes and the arrows, and each node has all its
attributes. An export with nodes and arrows but no version number counts as
version 2, because releases before the number wrote that layout. An import
rejects a version it does not know, such as one from a newer release.
An import replaces a node color that is no hex color, such as the `rgba()`
colors releases before March 2026 wrote, with the default color.

### Duplicate

Copy a whole map to a new map with a new address and new secrets. Never write
"clone" or "fork".

### Image cap

The most image bytes one map may store through image uploads or duplication.
Inline images that maps already contain, and the image extraction job, can
exceed the cap.

### Duplication storage budget

The total image bytes across all maps below which duplication may still add
image bytes. The budget counts the stored size of each image reference and the
UTF-8 bytes of each inline image data URL. Copies of copies count against the
same budget. The **image cap** limits the images of one map instead.

### Offline build

A static build of the frontend that runs without a backend. The offline build
stores maps in the browser's IndexedDB under the site's origin, so no other
browser or device sees them. The build switches off sharing, duplication,
pictograms, AI generation, the deletion date and collaboration. A service
worker caches the site, so the site loads without a network after the first
visit. See `docs/offline.md`. The **web version** is the build with a backend.

The **offline badge** reads "Offline mode" and appears on the start page and
the map screen of the offline build. The web version shows no badge.

## Sharing and collaboration

### Writable

A connection is writable when it presents the map's modification secret, and a
writable connection may edit the map. The app stores one boolean attribute for
it; read-only is the negation.

### Viewer link, editor link

The two addresses the share dialog offers. The viewer link opens the map
read-only. The editor link is the same address with the modification secret
appended after a `#`. Browsers do not send the part after the `#` to the
server, so the secret stays out of the server's logs.

The share dialog labels the two links "only observe" and "observe and modify".

### Modification secret

The secret that grants editing. The app generates the secret together with the
map, and the editor link carries it.

### Admin id

A second secret the app generates with the map, which authorizes deleting the
map. TeamMapper has no user accounts, so the admin id is neither an account nor
a login. Whoever has the admin id owns the map, and a browser remembers the
maps it created.

### Client

One open connection to a map. Two tabs are two clients, even for one person.

### Client list, client color

The **client list** shows everyone connected to a map at the moment. Each
client gets a **client color** from a fixed palette, and the ring around the
node that client selected takes that color. A client without a display name is
anonymous, and its color is its only identity. A client with a display name
shows its initials in its color.

### Display name

The optional name a browser announces on each map it opens, so others can tell
clients apart in the client list. The browser stores the name in its user
settings, and the server never stores it. Anyone can type any name, so a
display name proves nothing about identity. Write "display name"; avoid
"username" and "nickname", because TeamMapper has no accounts.

### Presence

The set of clients on a map at the moment and the node each one has selected.
The app sends presence apart from the map's content, and losing presence loses
no edits.

### Connection status

The state of this client's connection to the server. When the connection drops,
the app opens the "Connection lost" dialog with a reconnect button.

## Words for code

### Attribute

A named value on a data object, such as a node's `isRoot`, `protected` or
`name`. A boolean value is an attribute too: write "the `isRoot` attribute is
true", never "the node carries the root flag".

### Attribute group

A set of related node attributes that a node record stores under one key:
`colors`, `font`, `image` and `link`. The Y.Doc stores each attribute group as a
nested Y.Map with one key per attribute. When you change the background color
while a peer changes the name color, your clients write different keys, and
both colors survive the merge. The frontend and the backend also read a group
that a peer stored as a plain object.

### Flag

A switch that configures the app from outside its data: an environment
variable, a feature flag or a command-line option. A value stored on a node or a
map is an attribute.

### Format number

The version of the data the offline build stores in a browser. The browser
stores one number for all maps, and each map's Y.Doc stores the format number
of the build that saved it. A doc without a number has format number 1. A build
refuses to read or change data with a higher number, which a later build wrote.

### Migration

A numbered change that brings stored data to the layout a newer release reads.
Each migration runs once:

- The backend runs TypeORM migrations from `teammapper-backend/src/migrations/`
  on its PostgreSQL database.
- The offline build runs a data migration (`DataMigration`) on a map's doc the
  first time a build with a higher format number opens the map. See
  `docs/offline.md`.

### Map data

The nodes of one mind map, which all clients share. The app draws the map from
the map data and stores no copy of its own, so your edits, a peer's edits and
an undo all change the map data first, and the app redraws afterwards.

In the app, the map data syncs with the server and the other clients. The mmp
specs use `InMemoryMapData` instead. The **view state** and the **selection**
belong to one person and never enter the map data.

### Mark

Reserved for the **node mark**, one visual element of a drawn node. Write
"attribute" for a stored value: a node has attributes, and the renderer draws
marks.
