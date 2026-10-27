# yjs-bridge Specification

## Purpose

Defines the `MapData` contract through which mmp reads and writes the nodes of a mind map, its implementation over the Y.Doc, and how the frontend creates, imports, resets and deletes a map on top of it.

## Requirements

### Requirement: mmp reads and writes nodes through MapData
mmp SHALL read every node attribute through the `MapData` contract (`packages/mmp/src/map/data/map-data.ts`) and SHALL keep no copy of the nodes of its own. mmp SHALL write nodes only through the typed methods of the contract: `addNodes`, `updateNode`, `removeNode`, `replaceMap` and `batch`. No component SHALL send a network message per node edit; Yjs syncs the Y.Doc.

#### Scenario: User adds a node
- **WHEN** the user adds a node in mmp
- **THEN** mmp SHALL call `MapData.addNodes` with the new node's `ExportNodeProperties`
- **AND** mmp SHALL draw the node only after the map data reports the change

#### Scenario: User updates a node property
- **WHEN** the user changes one property of a node, such as `backgroundColor`
- **THEN** mmp SHALL call `MapData.updateNode` with the node id, the mmp property name and the value

#### Scenario: User removes a node
- **WHEN** the user removes a node
- **THEN** mmp SHALL call `MapData.removeNode` with the node id
- **AND** the map data SHALL remove the node and all its descendants

#### Scenario: Write to a missing node
- **WHEN** mmp calls `updateNode` or `removeNode` with an id the map data does not hold
- **THEN** the map data SHALL change nothing and SHALL notify no listener

#### Scenario: User pastes nodes
- **WHEN** the user pastes copied nodes
- **THEN** mmp SHALL write all pasted nodes with `addNodes` inside one `MapData.batch` call

### Requirement: YjsMapData stores the nodes in the Y.Doc
The frontend SHALL implement `MapData` in `YjsMapData` (`teammapper-frontend/src/app/core/services/map-sync/yjs-map-data.ts`) over the `nodes` Y.Map of the Y.Doc. Each node SHALL be a Y.Map stored under the node id. Every write SHALL run in a `yDoc.transact()` call whose origin is `LOCAL_ORIGIN` (`'local'`), so that `Y.UndoManager` tracks it.

#### Scenario: Add writes one Y.Map per node
- **WHEN** mmp calls `addNodes` with one or more nodes
- **THEN** `YjsMapData` SHALL set one Y.Map per node in the `nodes` map, keyed by the node id, in one transaction with origin `LOCAL_ORIGIN`

#### Scenario: Update writes one key of an attribute group
- **WHEN** mmp calls `updateNode` with a property of an attribute group, such as `backgroundColor`
- **THEN** `YjsMapData` SHALL look up the storage path in `NodePropertyMapping`
- **AND** SHALL set only that key in the nested Y.Map of the group, so a concurrent edit of another key in the same group survives the merge

#### Scenario: Remove deletes the subtree in one transaction
- **WHEN** mmp calls `removeNode` for a node with descendants
- **THEN** `YjsMapData` SHALL delete the node and every descendant from the `nodes` map in one transaction with origin `LOCAL_ORIGIN`

#### Scenario: Batch runs as one transaction
- **WHEN** mmp calls `batch` with several writes
- **THEN** `YjsMapData` SHALL run all writes in one transaction, so peers receive one update
- **AND** a nested `batch` SHALL join the transaction of the outer one

### Requirement: Every change reaches mmp as one MapDataChange
`YjsMapData` SHALL observe the `nodes` map and report each transaction to its `subscribe` listeners as one `MapDataChange` that lists the `added`, `updated` and `removed` node ids and sets `replaced` when the transaction adds or rewrites the main root. A local write, a peer's write and an undo SHALL reach mmp through this one path. The map data SHALL notify the listeners before a write returns, and inside `batch` once, when the outermost batch ends.

#### Scenario: Peer adds a node
- **WHEN** a peer's Y.Doc update adds a node to the `nodes` map
- **THEN** `YjsMapData` SHALL call each listener with a change whose `added` list holds the node id
- **AND** mmp SHALL draw the node

#### Scenario: Undo restores a node
- **WHEN** `Y.UndoManager` restores a removed node
- **THEN** `YjsMapData` SHALL report the node id in `added`
- **AND** mmp SHALL draw the node the same way it draws a peer's node

#### Scenario: Change inside an attribute group
- **WHEN** a transaction changes a key inside a node's nested Y.Map, such as `colors`
- **THEN** the change SHALL list the node id in `updated` once, and in no other list

#### Scenario: Transaction that touches no node
- **WHEN** a transaction changes the `nodes` map without adding, updating or removing a node and without replacing the main root
- **THEN** `YjsMapData` SHALL notify no listener

### Requirement: mmp redraws only the nodes a change touches
mmp SHALL subscribe to the map data when it creates the map and unsubscribe when it removes the map. For a change with `replaced` false, mmp SHALL redraw the added and updated nodes, drop the removed nodes and redraw the parents of the removed nodes. For a change with `replaced` true, mmp SHALL redraw the whole map, select the main root and center the view. After every change mmp SHALL emit `mapChange`.

#### Scenario: Peer updates one node
- **WHEN** the map data reports a change whose `updated` list holds one node id
- **THEN** mmp SHALL redraw that node and leave every other drawn node in place

#### Scenario: Selected node removed by a peer
- **WHEN** a change removes the node the user has selected
- **THEN** mmp SHALL deselect it

#### Scenario: Import replaces the map
- **WHEN** a change arrives with `replaced` set
- **THEN** mmp SHALL cancel a running drag without writing, draw the whole map again, select the main root and center the view on it

### Requirement: mmp emits no node events
mmp SHALL emit only the events `nodeSelect`, `nodeDeselect`, `nodeProtected` and `mapChange`. A node write SHALL reach other components through the map data and the `mapChange` event that follows it.

#### Scenario: Frontend follows a change
- **WHEN** mmp emits `mapChange`
- **THEN** the frontend SHALL read the selected node from mmp and update the attached node and the cached map

### Requirement: Stored coordinates decide a node's position
mmp SHALL draw every node at the coordinates the map data holds. mmp SHALL compute coordinates only when it creates a new child node whose properties carry no coordinates.

#### Scenario: Undo of delete keeps the original coordinates
- **WHEN** a node at coordinates `{x: 200, y: -120}` is deleted and the user triggers undo
- **THEN** the map data SHALL hold the node at `{x: 200, y: -120}`
- **AND** mmp SHALL draw the node at `{x: 200, y: -120}`

#### Scenario: Peer adds a node with coordinates
- **WHEN** a peer adds a node with specific coordinates
- **THEN** mmp SHALL draw the node at the coordinates from the map data

### Requirement: Parent lookup does not depend on change order
mmp SHALL resolve the parent of each node of a change from the map data, whatever order the change lists the ids in. A node whose parent the map data lacks SHALL draw as a root until a later change adds the parent, and a draw of the parent SHALL then draw the node under it.

#### Scenario: Subtree restore in one transaction
- **GIVEN** a parent node `A` with child `B` and grandchild `C` were deleted in one transaction
- **WHEN** the user triggers undo and all three nodes return in one transaction
- **THEN** mmp SHALL draw `B` under `A` and `C` under `B`, whatever order the change lists them in

### Requirement: Map options sync through the Y.Doc
The frontend SHALL write the map settings `fontMaxSize`, `fontMinSize` and `fontIncrement` to the `mapOptions` Y.Map in one transaction with origin `LOCAL_ORIGIN`. The frontend SHALL apply a peer's change of the `mapOptions` map to mmp with `updateAdditionalMapOptions`.

#### Scenario: User changes map settings
- **WHEN** the user changes a font size setting
- **THEN** the frontend SHALL write the three settings to the `mapOptions` map

#### Scenario: Peer changes map settings
- **WHEN** the `mapOptions` map changes in a peer's transaction
- **THEN** the frontend SHALL hand the settings to `mmpService.updateAdditionalMapOptions()`

### Requirement: Map import through replaceMap
mmp SHALL import a map with `MapData.replaceMap`. `YjsMapData` SHALL delete every entry of the `nodes` map, write the imported nodes and set `lastMapAnnouncement` to `'import'` in the `meta` map, all in one transaction. The import SHALL take an undo step of its own.

#### Scenario: User imports a map
- **WHEN** the user imports a map
- **THEN** `YjsMapData` SHALL replace the nodes and write the announcement in one transaction with origin `LOCAL_ORIGIN`
- **AND** every connected client SHALL receive the update and redraw the whole map

#### Scenario: Peer imports a map
- **WHEN** a peer's transaction replaces the main root and writes `lastMapAnnouncement` as `'import'`
- **THEN** the frontend SHALL clear the undo stack and show the import toast

#### Scenario: Peer undoes an import
- **WHEN** a peer's transaction replaces the main root without writing `lastMapAnnouncement`
- **THEN** the frontend SHALL clear the undo stack and show no import toast

### Requirement: Map deletion handling
When a map is deleted via the REST API, the server SHALL destroy the Y.Doc and close all WebSocket connections for that map with close code `4001`. The frontend SHALL detect that close code and reload the page.

#### Scenario: Admin deletes a map
- **WHEN** the admin calls the map deletion REST endpoint
- **THEN** the server SHALL destroy the in-memory Y.Doc for that map and close all associated WebSocket connections

#### Scenario: Client detects map deletion
- **WHEN** the server closes the client's WebSocket connection with close code `4001`
- **THEN** the frontend SHALL remove the syncing toast and reload the page

### Requirement: Map creation after the first sync
When a user opens a map, the frontend SHALL receive the map state through the Yjs sync protocol. `YjsSyncService` SHALL create the Y.Doc and its `YjsMapData` before it connects, and SHALL hand the map data to `MapSyncService` on the first sync. `MapSyncService` SHALL then create mmp over the map data and call `YjsSyncService.attachMap`, which wires the listeners, presence and the undo manager and sets edit mode last. Opening a map SHALL write nothing to the Y.Doc.

#### Scenario: User opens an existing map
- **WHEN** the WebsocketProvider fires its first `sync` event with `synced: true`
- **THEN** `YjsSyncService` SHALL hand the `YjsMapData` to `MapSyncService`
- **AND** `MapSyncService` SHALL create mmp over it, so mmp draws the nodes the Y.Doc holds

#### Scenario: Reopen a synced map
- **WHEN** `initMap` runs while a connection is open, for the same map or another
- **THEN** `YjsSyncService` SHALL destroy the open connection, its Y.Doc and its undo manager, and keep the writable state
- **AND** `YjsSyncService` SHALL create a new Y.Doc with its `YjsMapData`, open a new connection, and hand the map data over on the next first sync

### Requirement: Map creation after a server reset
When the server closes the connection with `WS_CLOSE_MAP_SYNC_RESET`, the frontend SHALL tear down the connection, the Y.Doc and the undo manager, reconnect to the same map and create the map anew after the next first sync.

#### Scenario: Server resets the map sync
- **WHEN** the WebSocket closes with code `WS_CLOSE_MAP_SYNC_RESET`
- **THEN** the frontend SHALL turn edit mode off, destroy the connection and open a new one to the same map
- **AND** the frontend SHALL keep the writable state and create the map over the new map data after the next sync
