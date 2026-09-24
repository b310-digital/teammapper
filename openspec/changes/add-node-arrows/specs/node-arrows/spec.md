## ADDED Requirements

### Requirement: An arrow connects two nodes without changing the tree

The system SHALL let a map hold arrows. An arrow SHALL connect a source node to a target node of the same map and SHALL point from the source to the target. An arrow SHALL be identified by its source and target, so a map SHALL hold at most one arrow per source and target pair. An arrow SHALL NOT change the parent of any node, the layout, or redistribution.

#### Scenario: Arrow leaves the tree unchanged

- **GIVEN** a map with nodes A and B in different branches
- **WHEN** the user creates an arrow from A to B
- **THEN** the parent of A and the parent of B SHALL be unchanged
- **AND** redistributing the map SHALL place every node where it would without the arrow

#### Scenario: Redistribute keeps arrows

- **GIVEN** a map with an arrow from A to B
- **WHEN** any client redistributes the map
- **THEN** every client SHALL still hold the arrow from A to B
- **AND** the arrow SHALL be drawn between the new positions of A and B

#### Scenario: Arrow between trees

- **GIVEN** a map with two trees
- **WHEN** the user creates an arrow from a node of one tree to a node of the other
- **THEN** the system SHALL create the arrow

### Requirement: User creates an arrow in arrow mode

A writable client SHALL enter arrow mode through the "connect with arrow" toolbar button or `alt+a` while a node is selected. In arrow mode the selected node SHALL be the source, and a click on an allowed node SHALL create an arrow to it and leave arrow mode with the source selected. Escape, a click on empty space or a second press of the button SHALL leave arrow mode and create nothing. With no node selected, the button SHALL be disabled and `alt+a` SHALL do nothing.

#### Scenario: Create an arrow

- **GIVEN** node A is selected
- **WHEN** the user presses the "connect with arrow" button and clicks node B
- **THEN** the system SHALL create an arrow from A to B
- **AND** arrow mode SHALL end with A selected

#### Scenario: Create an arrow by shortcut

- **GIVEN** node A is selected
- **WHEN** the user presses `alt+a` and clicks node B
- **THEN** the system SHALL create an arrow from A to B

#### Scenario: Cancel arrow mode

- **GIVEN** arrow mode is active
- **WHEN** the user presses Escape, clicks empty space or presses the "connect with arrow" button again
- **THEN** arrow mode SHALL end
- **AND** the system SHALL create no arrow

#### Scenario: Preview while in arrow mode

- **WHEN** arrow mode is active and the pointer moves
- **THEN** the system SHALL draw a preview from the source node to the pointer

#### Scenario: Nothing selected

- **GIVEN** no node is selected
- **THEN** the "connect with arrow" button SHALL be disabled
- **AND** `alt+a` SHALL NOT enter arrow mode

#### Scenario: Read-only client

- **GIVEN** the client is not writable
- **THEN** the "connect with arrow" button SHALL NOT be shown
- **AND** `alt+a` SHALL NOT enter arrow mode

### Requirement: Arrow mode ends when its source goes away

Arrow mode SHALL end and create nothing when its source node is removed or hidden, by the local client or a peer, when the map is replaced as a whole, or when the client loses write access.

#### Scenario: Peer removes the source

- **GIVEN** arrow mode is active with source A
- **WHEN** a peer removes A
- **THEN** arrow mode SHALL end
- **AND** the system SHALL create no arrow

#### Scenario: Source becomes hidden

- **GIVEN** arrow mode is active with source A
- **WHEN** A becomes hidden because an ancestor's children are hidden
- **THEN** arrow mode SHALL end

#### Scenario: Map replaced during arrow mode

- **GIVEN** arrow mode is active
- **WHEN** any client imports a map
- **THEN** arrow mode SHALL end

### Requirement: Arrow mode suspends other map interaction

While arrow mode is active, the system SHALL ignore every map shortcut except Escape and SHALL NOT let the user drag a node. A click on a toolbar button other than "connect with arrow" SHALL end arrow mode before the button acts.

#### Scenario: Shortcut in arrow mode

- **GIVEN** arrow mode is active with source A
- **WHEN** the user presses `-`
- **THEN** A SHALL remain
- **AND** arrow mode SHALL stay active

#### Scenario: Drag in arrow mode

- **GIVEN** arrow mode is active
- **WHEN** the user drags node B
- **THEN** B SHALL NOT move

### Requirement: The system refuses meaningless arrows

The system SHALL refuse an arrow from a node to itself, an arrow with the same source and target as an existing arrow, and an arrow between a node and its parent. An arrow in the opposite direction of an existing arrow SHALL be allowed. A click on a refused node in arrow mode SHALL create no arrow, SHALL tell the user why, and SHALL leave arrow mode active. The rules SHALL apply when an arrow is created or imported, not to an arrow that already exists.

#### Scenario: Arrow to itself

- **GIVEN** arrow mode is active with source A
- **WHEN** the user clicks A
- **THEN** the system SHALL create no arrow and SHALL tell the user why
- **AND** arrow mode SHALL stay active

#### Scenario: Duplicate arrow

- **GIVEN** an arrow from A to B exists and arrow mode is active with source A
- **WHEN** the user clicks B
- **THEN** the system SHALL create no arrow and SHALL tell the user why
- **AND** arrow mode SHALL stay active

#### Scenario: Arrow along a branch

- **GIVEN** B is a child of A
- **WHEN** the user in arrow mode with source A clicks B, or with source B clicks A
- **THEN** the system SHALL create no arrow and SHALL tell the user why
- **AND** arrow mode SHALL stay active

#### Scenario: Opposite direction

- **GIVEN** an arrow from A to B exists
- **WHEN** the user creates an arrow from B to A
- **THEN** the system SHALL create the arrow

#### Scenario: Arrow between two roots

- **GIVEN** a map with two trees
- **WHEN** the user creates an arrow from the main root to the root of the other tree
- **THEN** the system SHALL create the arrow

#### Scenario: Refused targets are marked

- **WHEN** arrow mode is active
- **THEN** every node the source may not connect to SHALL be marked as refused

#### Scenario: Existing arrow survives a move under its other endpoint

- **GIVEN** an arrow from A to B
- **WHEN** a client moves B to be a child of A
- **THEN** the arrow SHALL remain and SHALL be drawn

#### Scenario: Concurrent creation of the same arrow

- **GIVEN** two clients have the map open
- **WHEN** both create an arrow from A to B at the same time
- **THEN** each client SHALL hold one arrow from A to B
- **AND** removing it on one client SHALL remove it on both

### Requirement: Arrows render distinct from branches

The system SHALL draw every arrow as a dashed curve from the border of its source node to the border of its target node, with one arrowhead at the target. Arrows SHALL be drawn above branches and below nodes. An arrow SHALL carry no name, color or style of its own. An arrow SHALL follow its nodes whenever their position or size changes, whatever caused the change.

#### Scenario: Arrow drawn

- **WHEN** a map with an arrow from A to B loads
- **THEN** the system SHALL draw a dashed curve from A's border to B's border with an arrowhead at B

#### Scenario: Arrow follows a drag

- **GIVEN** an arrow from A to B
- **WHEN** the user drags B
- **THEN** the arrow SHALL end at B's border throughout the drag

#### Scenario: Arrow follows a locked drag

- **GIVEN** A is locked and an arrow connects A's child C to node D
- **WHEN** the user drags A
- **THEN** the arrow SHALL start at C's border throughout the drag

#### Scenario: Arrow follows a peer's move

- **GIVEN** two clients show an arrow from A to B
- **WHEN** one client moves B
- **THEN** the other client SHALL draw the arrow ending at B's new border

#### Scenario: Arrow follows an undone move

- **GIVEN** an arrow from A to B and the user has dragged B
- **WHEN** the user presses undo
- **THEN** the arrow SHALL end at B's border at its previous position

#### Scenario: Arrow follows a resize

- **GIVEN** an arrow from A to B
- **WHEN** B changes size because its name, font or image changes, locally or by a peer
- **THEN** the arrow SHALL end at B's new border

#### Scenario: Hidden endpoint

- **GIVEN** an arrow from A to B
- **WHEN** B is hidden because an ancestor's children are hidden
- **THEN** the system SHALL NOT draw the arrow
- **AND** showing B again SHALL draw the arrow again

#### Scenario: Missing endpoint

- **WHEN** an arrow names a node the client does not hold
- **THEN** the system SHALL NOT draw the arrow
- **AND** the client SHALL keep the arrow and draw it once the node exists

### Requirement: User selects and removes an arrow

A writable client SHALL select an arrow by clicking it. Selecting an arrow SHALL leave no node selected, as deselecting does, and selecting a node SHALL clear the arrow selection. While an arrow is selected, `-`, `backspace`, `delete` and the toolbar remove button SHALL remove that arrow and no node, and shortcuts that act on a selected node SHALL do nothing. `delete` SHALL also remove the selected node when no arrow is selected. A click on empty space SHALL clear the arrow selection and leave no node selected. A read-only client SHALL NOT select an arrow.

#### Scenario: Remove a selected arrow

- **GIVEN** an arrow from A to B and A is selected
- **WHEN** the user clicks the arrow and presses Delete
- **THEN** the system SHALL remove the arrow
- **AND** A and B SHALL remain

#### Scenario: Remove shortcut with an arrow selected

- **GIVEN** an arrow from A to B is selected
- **WHEN** the user presses `-` or Backspace
- **THEN** the system SHALL remove the arrow
- **AND** A, B and their descendants SHALL remain

#### Scenario: Remove with the toolbar

- **GIVEN** an arrow is selected
- **WHEN** the user presses the toolbar remove button
- **THEN** the system SHALL remove the arrow and no node

#### Scenario: Selecting an arrow deselects the node

- **GIVEN** node A is selected
- **WHEN** the user clicks an arrow
- **THEN** the arrow SHALL be selected
- **AND** no node SHALL be selected

#### Scenario: Clear arrow selection

- **GIVEN** an arrow is selected
- **WHEN** the user clicks a node or empty space
- **THEN** no arrow SHALL be selected

#### Scenario: Peer removes the selected arrow

- **GIVEN** an arrow is selected
- **WHEN** a peer removes the arrow or one of its endpoints
- **THEN** no arrow SHALL be selected

### Requirement: Arrows follow node removal, copy and paste

Removing or cutting a node SHALL remove every arrow whose source or target is that node or one of its descendants, and deleting a root SHALL remove every arrow attached to its tree. Copying a node, a root other than the main root included, SHALL copy every arrow whose source and target both lie in the copied subtree, and pasting SHALL create those arrows between the pasted nodes, whether the paste attaches under the selected node or creates an independent tree. An arrow with one endpoint outside the copied subtree SHALL NOT be copied.

#### Scenario: Remove a node with arrows

- **GIVEN** an arrow from A to B and an arrow from B's child C to D
- **WHEN** the user removes B
- **THEN** both arrows SHALL be removed

#### Scenario: Paste a subtree with an inner arrow

- **GIVEN** B and C are descendants of A and an arrow runs from B to C
- **WHEN** the user copies A and pastes it
- **THEN** an arrow SHALL run from the pasted B to the pasted C
- **AND** the arrow between the original B and C SHALL remain

#### Scenario: Delete a tree with arrows

- **GIVEN** a map with two trees and an arrow from a node of the second tree to a node of the main tree
- **WHEN** the user deletes the root of the second tree
- **THEN** the arrow SHALL be removed
- **AND** the node of the main tree SHALL remain

#### Scenario: Paste a tree with nothing selected

- **GIVEN** B and C are descendants of a root R outside the main tree and an arrow runs from B to C
- **WHEN** the user copies R, deselects, and pastes
- **THEN** the paste SHALL create an independent tree
- **AND** an arrow SHALL run from the pasted B to the pasted C

#### Scenario: Paste leaves outer arrows behind

- **GIVEN** B is a descendant of A and an arrow runs from B to a node outside A's subtree
- **WHEN** the user copies A and pastes it
- **THEN** the pasted B SHALL have no arrow

### Requirement: Undo covers arrows

Undo and redo SHALL cover creating and removing an arrow. Undoing a node removal SHALL restore the arrows that removal took along, in the same step. Undoing an import SHALL restore the arrows the map held before it.

#### Scenario: Undo arrow creation

- **WHEN** the user creates an arrow and presses undo
- **THEN** the arrow SHALL be removed

#### Scenario: Undo arrow removal

- **GIVEN** the user has removed a selected arrow
- **WHEN** the user presses undo
- **THEN** the arrow SHALL be drawn again

#### Scenario: Undo node removal restores arrows

- **GIVEN** an arrow from A to B
- **WHEN** the user removes B and presses undo once
- **THEN** B and the arrow SHALL both be restored

### Requirement: Arrows sync between clients

Every arrow a client creates or removes SHALL reach every other client of the map. A client SHALL NOT draw an arrow whose endpoint it does not hold or has hidden.

#### Scenario: Peer sees a new arrow

- **GIVEN** two clients have the map open
- **WHEN** one client creates an arrow
- **THEN** the other client SHALL draw the arrow

#### Scenario: Peer sees a removed arrow

- **GIVEN** two clients show an arrow
- **WHEN** one client removes the arrow
- **THEN** the other client SHALL no longer draw it

#### Scenario: Concurrent removal of an endpoint

- **GIVEN** two clients have the map open
- **WHEN** one client creates an arrow to node B while the other removes B
- **THEN** no client SHALL draw the arrow, including a client that loads the map afterwards
- **AND** the stored map SHALL hold no such arrow

#### Scenario: Undo revives a dangling arrow

- **GIVEN** a peer created an arrow to B while this client removed B
- **WHEN** this client undoes the removal of B
- **THEN** every client SHALL draw B and the arrow

### Requirement: Arrow mode is gated by a feature flag

The `arrows` flag in `SystemFeatureFlags` SHALL gate the "connect with arrow" button and `alt+a`. Drawing, selecting, removing, syncing, storing and exporting arrows SHALL NOT depend on the flag.

#### Scenario: Flag off

- **GIVEN** the `arrows` flag is off
- **WHEN** a map with arrows loads
- **THEN** the system SHALL draw the arrows
- **AND** the "connect with arrow" button SHALL NOT be shown
