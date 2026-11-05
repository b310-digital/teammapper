# Glossary

The terms TeamMapper uses for mind maps and the app's behavior. Use the same
terms in code, comments, commit messages, issues and documentation.

Use standard mind mapping vocabulary where possible. Entries explain terms
specific to TeamMapper.

## Words to avoid

| Do not write                            | Write instead                      |
| --------------------------------------- | ---------------------------------- |
| board, canvas, diagram, chart, document | mind map                           |
| Mindmap, mindmap (one word)             | mind map                           |
| card, box, bubble, topic, item          | node                               |
| central topic, main idea, centre        | main root                          |
| edge                                    | branch                             |
| fold, collapse, unfold, expand          | hide, show                         |
| clone, fork                             | duplicate                          |
| version, revision, snapshot (of a map)  | edit or state; see **Undo / Redo** |
| flag, mark (for a stored value)         | attribute                          |

### Reserved

**Arrow** names a relation between two nodes that are not parent and child. Do
not write **connector** or **line** for an arrow, and do not use any of the
three words for a branch.

**Map file version** and **format number** describe data formats. They do not
refer to earlier states of a map.

## The model

### Mind map

A visual arrangement of ideas as nodes connected by branches. In TeamMapper,
a mind map contains one or more trees and the map settings. Write "mind map"
in prose and **map** in identifiers and URLs.

The app's own screens say "Mindmap" in most places and "mind map" in others.
Write "mind map".

### Node

One idea or piece of information in a mind map. A node has a name, position,
colors and font, and may include an image and a link. Every node except a root
node has one parent.

### Parent, child, ancestor, descendant

A **parent** is the node directly above another node in the tree's hierarchy.
The node directly below it is its **child**. A **descendant** is a child, a
child's child, or any node further down that hierarchy. An **ancestor** is a
parent or any node further up the hierarchy. These relationships describe the
tree structure, regardless of where nodes appear on screen.

### Tree

A root node and all its descendants. A map has one or more trees, and the
layout arranges each tree around its own root node.

### Subtree

A node and all its descendants. Copying, cutting or removing a node acts on
its whole subtree.

### Layout

The positions of nodes in a map. The layout arranges each tree around its root
node and leaves space between trees. Dragging changes positions manually;
redistributing computes them again.

### Root node

A node with no parent. Each root node starts a tree, and the map draws no
branch to it. Every map has at least one root node, the main root.

### Main root

The map's primary root node, created with the map. Each map has exactly one,
which no one can delete, copy or cut. The attribute `isRoot` identifies the
main root; it is false for all other nodes, including other root nodes. Check
the parent to tell whether a node is a root node.

### Orphaned node

A node disconnected from every root node because a parent is missing or the
parent relationships form a cycle. This includes descendants of affected
nodes. Orphaned nodes indicate invalid map data. The layout places them in a
column to the right of the trees, without treating them as trees.

An import turns orphaned nodes into root nodes, with their subtrees below them.
The import removes the parent link of each self-referencing node, each node
with a missing parent, and one node in each cycle. The user sees one warning.

When the backend saves or duplicates a map, it omits orphaned nodes, logs their
IDs and deletes their database rows to satisfy the parent foreign key.

A node with no parent is a root node, never an orphaned node.

### Branch

The connection between a parent node and a child node. Its shape follows the
**branch style**, and its color comes from the child's branch color or the
automatic branch colors user setting. A branch cannot be selected or edited
independently of its nodes.

### Branch style

The user setting for the shape of branches in this browser:

- `tapered`, the default: a filled shape that narrows with depth
- `curved`: a thin curve
- `straight`: a straight line between the centers of the parent and child

Branch style affects appearance only. It stays in this browser and is not
stored with the map or shared with collaborators.

### Node color

The colors of a node's name, background and branch. Set them with the **color
picker** in the color panel beside the selected node. Each value is a hex
color (`#rgb`, `#rrggbb` or `#rrggbbaa`), or an empty value for no color. The
picker writes `#rrggbbaa`, with the opacity in the last two digits.

### Arrow

A directed connection between two nodes in the same map, from the **source**
to the **target**. Arrows express relationships outside the tree hierarchy.
They appear as dashed curves with an arrowhead at the target, above branches
and below nodes. An arrow has no name or style of its own and does not affect
parent relationships, layout or redistribution.

A map allows one arrow per source and target, identified by
`arrowKey(source, target)`. The reverse direction is a separate arrow. Arrows
cannot connect a node to itself or to its parent. Removing a node removes its
arrows. Copying nodes includes arrows whose endpoints are both in the copied
subtree.

**Arrow mode** starts at the selected node and creates an arrow to the node you
click next. A **dangling arrow** has a source or target that no longer exists,
for example when one peer removes a node while another adds an arrow to it.
The map does not draw dangling arrows, and the backend does not save them.

### Link

A web address (HTTP or HTTPS) attached to a node. Each node can have one link.
The map shows it as an icon, or as the full address when the **linktext** user
setting is on. "Linktext" is TeamMapper's term for that text display.

### Image

A photograph, illustration or other visual attached to a node. Each node can
have one image. Write "image", never "picture" or "attachment".

The current frontend adds images as **image references**. Existing maps, older
clients and imports may contain inline raster data URLs. Exports embed every
image as a data URL.

### Image reference

A reference to an image stored on the server for a map, written as
`image:<uuid>`. The server generates the UUID on upload. The map and UUID
together identify the image; a duplicated map resolves the same references.
"Image id" means the UUID alone, not the whole reference.

### Pictogram

A symbol from the ARASAAC library that can be inserted as a node image. Search
by term in the pictogram dialog. Availability depends on the server.

### Protected branch

A subtree protected against local edits. A user protects or releases it with
the lock button in the toolbar. The app stores `protected` on the subtree's
top node and shows a lock badge there. Protection applies to that node and all
its descendants, and syncs to every client.

Protection prevents local changes to names, styling, images and links, as well
as dragging, adding children, pasting, removing and cutting. Peer writes, undo,
redo, redistribute and import still apply. The server does not enforce
protection; anyone with edit access can release the branch and edit it.

Write "protect" and "release". Avoid "lock" for the concept, and avoid "freeze"
and "read-only", which name a client that cannot write.

### Hidden node

A node temporarily omitted from view when a user hides an ancestor's children.
This also hides new nodes that peers add below that ancestor. Hidden nodes
remain in the map and keep their space in the layout.

Write "hide" and "show". Avoid "collapse" and "fold".

### View state

The record of which nodes have their children hidden for one person. mmp keeps
it separate from map data and undo history. View state is neither saved nor
shared with the server or peers. Opening or reloading a map shows all nodes.

### Selection, ring

The **selection** is the client's currently selected node, or none. A **ring**
outlines the selected node. Peers' selections have rings in their respective
client colors. Each client keeps its selection separate from map data and
view state, and shares it through Yjs awareness (see **Presence**).

### Map settings

Settings stored with a mind map, such as its font size range.

**User settings** belong to one browser and control its view preferences and
defaults for new maps and nodes:

- automatic branch colors
- centering on resize
- showing linktext
- the branch style
- the starting name and styling of root nodes and ordinary nodes

### Info dialog

The dialog opened by the info button or `?`. It shows the app version, legal
links, keyboard shortcuts and a note directing users to the deletion date in
settings. Map shortcuts are inactive while the dialog is open.

### Legal links

Links to the instance's imprint and privacy information, shown in the info
dialog and the start page footer. The operator sets their addresses with
`imprintUrl` and `privacyUrl` in system settings, or the environment variables
`IMPRINT_URL` and `PRIVACY_URL`. Each link appears only when configured.

### Settings dialog

The dialog opened by the settings button or `alt+s`, with three tabs:

1. General: language and dark mode.
2. Map options: the deletion card, the map settings of the open map, and the
   user settings for new nodes, linktext and centering.
3. The map list.

Changes take effect immediately in the map behind the dialog. Map shortcuts
are inactive while the dialog is open.

### Deletion card

The section at the top of the settings dialog's Map options tab that shows
the map's deletion date and the server's retention period. It also lets the
map's admin delete the map.

The map list, available in settings and on the start page, also offers deletion
for each map whose admin id the browser stores. The map need not be open.

### Node mark

A visual part of a node: its background, name, image, link, hidden eye icon or
lock badge. The term comes from data visualization, where a mark represents
data visually. The renderer in `packages/mmp` defines these parts in
`NODE_MARKS`; adding a visual part means adding a mark.

One mark may contain several DOM elements, such as a link's `<a>` and `<text>`.
Use "DOM element" or the tag name for an individual browser object, and "node
group" for the `<g>` containing a node's marks.

## What you can do to a map

### Add, remove, select, deselect

- **Add** creates a child of a parent node. The toolbar's "add tree" button
  creates a root node instead, at the available spot nearest the viewport's
  center, clear of other trees, and selects it.
- **Remove** deletes a node and its descendants. Removing a root node deletes
  its tree. The main root cannot be removed.
- **Select** makes a node the target of editing actions. Loading a map selects
  the main root.
- **Deselect** clears the selection, even when the main root is selected.

With no selection, actions that require a selected node do nothing, and their
toolbar and floating buttons are disabled. Paste can still add a tree (see
**Copy, cut, paste**).

### Drag

Move a node and its descendants with the pointer. Protected nodes cannot be
dragged.

### Redistribute

Arrange all nodes in the map automatically by recomputing their positions.
TeamMapper calls this **redistribute**; the toolbar describes it as
distributing all nodes evenly.

### Copy, cut, paste

Clipboard operations on a subtree. Copy puts the subtree on the clipboard;
cut also removes it from the map. The main root cannot be copied or cut.

With no node selected, paste adds the copied subtree as a new tree, places it
clear of other trees and pans the view to show it. The selection stays empty,
so pasting again adds another tree. Pasted nodes never become the main root.

### Undo / Redo

**Undo** reverses your most recent edit. **Redo** reapplies an undone edit.
Each client has its own undo history; undo never reverses a collaborator's
edits.

TeamMapper stores no version history or saved earlier states to restore.

### Zoom, center

**Zoom** changes the viewing scale. **Center** brings the main root to the
middle of the viewport. Both change the view without moving nodes in the map.

### Viewport

The visible area of the map in one client. Zoom changes its scale; panning
moves it across the map. Neither changes node coordinates. Each client has an
independent viewport, so collaborators may be looking at different trees.

### Import

Load a JSON export or Mermaid mindmap syntax into the current map, replacing
all its content. Import does not merge maps.

### AI generate

Create map content from a written description. The server generates Mermaid
syntax, which the app imports through the usual Mermaid import. Availability
depends on the server.

The request can set the shape of the map:

- **levels**: the depth below the main root, from 1 to 3 (default 2)
- **children per node**: the maximum number of children for each node, from
  1 to 4 (default 4)

The requested shape allows at most 20 nodes below the main root, so 3 levels
allow at most 2 children per node. The server removes generated nodes beyond
these limits, along with their descendants, and does not fill in missing nodes.
If generation reaches the output token limit, the app warns the user and
imports the content received so far.

### Export

Save the map to a file. Available formats are JSON, Mermaid, SVG, PNG, JPEG and
PDF.

### Map file version

The integer identifying a JSON export's data format. Import uses it to choose
the validation rules:

- **Version 1** is a plain list of nodes, used by older releases and the
  Mermaid import. Nodes may lack a link, `isRoot` and coordinates. The format
  contains no arrows.
- **Version 2** contains the version number, nodes and arrows. Each node has
  all its attributes. An export object without a version number also counts
  as version 2, because earlier releases wrote that format without a number.

Import rejects unknown versions, including those from newer releases. It
replaces non-hex node colors with the default color, including the `rgba()`
values written before March 2026.

### Duplicate

Create an independent copy of a whole map, with a new address and new secrets.
Write "duplicate", never "clone" or "fork".

### Image cap

The maximum image storage allowed for one map through uploads or duplication.
Existing inline images and the image extraction job can exceed this limit.

### Duplication storage budget

The storage limit across all maps that controls whether duplication may add
image data. It counts the stored bytes of referenced images and the UTF-8
bytes of inline image data URLs. Copies of copies count toward the same
budget. See **Image cap** for the limit on a single map.

### Offline build

A static frontend that runs without a backend. Maps stay in this browser's
IndexedDB, under the site's origin, and are not available in other browsers or
on other devices. A service worker caches the site for use without a network
after the first visit.

The offline build disables sharing, duplication, pictograms, AI generation,
the deletion date and collaboration. The **web version** uses a backend. See
`docs/offline.md`.

The **offline badge** reads "Offline mode" and appears on the start page and
the map screen of the offline build. The web version shows no badge.

## Sharing and collaboration

### Writable

Allowed to edit the map. A connection gains edit access by presenting the
map's modification secret. The app represents this permission as one boolean
attribute: true means writable; false means read-only.

### Viewer link, editor link

The two sharing addresses offered by the share dialog. A **viewer link** opens
the map read-only. An **editor link** grants edit access by adding the
modification secret after `#` in the same address. This part of the URL, the
fragment, is not sent in HTTP requests, keeping the secret out of request logs.

The share dialog labels the two links "only observe" and "observe and modify".

### Modification secret

The secret granting edit access to a map. It is generated with the map and
included in the editor link.

### Admin id

The secret authorizing deletion of a map, generated separately from the
modification secret. TeamMapper has no user accounts or logins: possession of
the admin id establishes ownership. The browser remembers the maps it creates
and their admin ids.

### Client

One open connection to a map. Two browser tabs are two clients, even when used
by the same person.

### Client list, client color

The **client list** shows the clients currently connected to a map. Each has a
**client color** from a fixed palette, used for its selection ring. Named
clients show their initials in that color; anonymous clients are identified
by color alone.

### Display name

An optional name shown to collaborators to help identify a client. The browser
keeps it in user settings and announces it when opening a map; the server does
not store it. Anyone can choose any name, so it does not verify identity.
Write "display name", not "username" or "nickname": TeamMapper has no accounts.

### Presence

Who is connected to a map and which node each client has selected. Presence
updates travel separately from map content, so losing them does not lose edits.

### Connection status

Whether this client can reach the server. A lost connection opens the
"Connection lost" dialog, which offers a reconnect button.

## Words for code

### Attribute

A named value stored on an object, such as a node's `name`, `isRoot` or
`protected`. Boolean values are attributes too. Write "the `isRoot` attribute
is true", never "the node carries the root flag".

### Attribute group

A set of related node attributes stored under one key: `colors`, `font`,
`image` or `link`. Each group is a nested Y.Map in the Y.Doc, with a separate
key for each attribute. This lets simultaneous changes to different attributes
merge: one client can change the background color while another changes the
name color, and both changes survive. The frontend and backend also accept
groups stored as plain objects by peers.

### Flag

A configuration switch, such as a feature flag, environment variable or
command-line option. Use **attribute** for a value stored on a node or map.

### Format number

The number identifying the data format of maps stored by the offline build.
The browser stores one number for all maps, and each map's Y.Doc records the
format number it was saved with. A Y.Doc without a number has format number 1.
A build refuses to read or change data with a higher number than it supports.

### Migration

A numbered change that updates stored data to a newer format. Each migration
runs once for the data it updates:

- The backend runs TypeORM migrations from `teammapper-backend/src/migrations/`
  on its PostgreSQL database.
- The offline build runs a data migration (`DataMigration`) on a map's doc the
  first time a build with a higher format number opens the map. See
  `docs/offline.md`.

### Map data

The shared content of a mind map, including its nodes and arrows. The renderer
draws directly from map data rather than maintaining a separate editable copy.
Local edits, peer edits and undo all update map data first, then trigger a
redraw.

In the web version, map data syncs with the server and other clients. The mmp
specs use `InMemoryMapData`. **View state** and **selection** belong to each
client and are kept outside map data.

### Mark

Reserved for the **node mark**, one visual element of a drawn node. Write
"attribute" for a stored value: a node has attributes, and the renderer draws
marks.
