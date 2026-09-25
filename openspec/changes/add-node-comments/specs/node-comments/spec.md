## ADDED Requirements

### Requirement: A comment belongs to one node

A comment SHALL hold an id, the id of the node it belongs to, a plain text, a creation time and a time of the last edit. A comment SHALL carry no author, name or other identity. The text SHALL be plain text of 1 to 2000 characters after trimming whitespace. A node MAY hold any number of comments.

#### Scenario: Comment stored with its node id

- **WHEN** a user adds the comment "Check the numbers" to node A
- **THEN** the map SHALL hold a comment with a new id, the id of A, the text "Check the numbers" and equal creation and edit times

#### Scenario: Comment is anonymous

- **WHEN** any client shows a comment
- **THEN** it SHALL show no author or name

### Requirement: User adds a comment through the comment button

The toolbar SHALL show a comment button with a speech bubble icon. With a node selected on a writable client, pressing it SHALL open the comment panel for that node and focus its input. Submitting the input SHALL add the comment and clear the input. The input SHALL submit through its save button and through Ctrl+Enter or Cmd+Enter. A text that is empty after trimming SHALL NOT be submittable.

#### Scenario: Add a first comment

- **GIVEN** node A has no comments and is selected
- **WHEN** the user presses the comment button, types "Check the numbers" and saves
- **THEN** the comment panel SHALL list the comment
- **AND** A SHALL show the comment badge on every client

#### Scenario: Nothing selected or read-only

- **GIVEN** no node is selected, or the client is not writable
- **THEN** the comment button SHALL be disabled

#### Scenario: Empty text

- **GIVEN** the comment input holds only spaces
- **THEN** the save button SHALL be disabled
- **AND** Ctrl+Enter SHALL add nothing

#### Scenario: Typing does not trigger map shortcuts

- **GIVEN** the comment input has the focus
- **WHEN** the user presses Delete, Backspace, Tab or Enter
- **THEN** the map SHALL not change
- **AND** the key SHALL edit the input

### Requirement: Comment panel lists the comments of one node

The comment panel SHALL sit on the right side of the map and SHALL be hidden until the user opens it through the comment button or a comment badge. It SHALL show the name of its node and list that node's comments, oldest first by creation time and then by id, each with its text and creation time, and a note when the comment was edited. It SHALL have a button that collapses it again. While open, the panel SHALL follow the selected node. With no node selected it SHALL show a hint to select a node. The panel SHALL update without a reload when a comment of its node is added, edited or deleted on any client.

#### Scenario: Panel hidden by default

- **WHEN** a client opens a map
- **THEN** the comment panel SHALL be hidden

#### Scenario: Collapse the panel

- **GIVEN** the comment panel is open
- **WHEN** the user presses its collapse button
- **THEN** the panel SHALL be hidden
- **AND** the comments SHALL stay unchanged

#### Scenario: Panel follows the selection

- **GIVEN** the comment panel is open for node A
- **WHEN** the user selects node B
- **THEN** the panel SHALL list the comments of B

#### Scenario: Peer's comment appears

- **GIVEN** client 1 shows the comment panel for node A
- **WHEN** client 2 adds a comment to A
- **THEN** client 1 SHALL list the new comment without a reload

#### Scenario: Node removed while the panel is open

- **GIVEN** the comment panel is open for node A and its input holds unsaved text
- **WHEN** a peer removes A
- **THEN** the panel SHALL follow the new selection or show the hint
- **AND** the unsaved text SHALL be discarded without writing a comment

#### Scenario: Read-only client

- **GIVEN** the client is not writable
- **WHEN** the user opens the comment panel through a badge
- **THEN** the panel SHALL list the comments
- **AND** it SHALL show no input and no edit or delete buttons

### Requirement: Comment badge marks a node with comments

A node with at least one comment SHALL show a speech bubble badge on its left side. The badge SHALL name the number of comments in its tooltip and accessible label. Clicking the badge SHALL select the node and open the comment panel for it. The badge SHALL appear and disappear on every client as comments are added and deleted. A node that is not drawn, such as a hidden node, SHALL show no badge. Image exports of the map SHALL NOT contain the badge.

#### Scenario: Badge opens the panel

- **GIVEN** node A holds two comments and the panel is hidden
- **WHEN** the user clicks the badge of A
- **THEN** A SHALL be selected
- **AND** the comment panel SHALL open and list both comments

#### Scenario: Last comment deleted

- **GIVEN** node A holds one comment
- **WHEN** any client deletes it
- **THEN** A SHALL show no badge on every client

#### Scenario: Image export

- **GIVEN** node A holds a comment
- **WHEN** the user exports the map as PNG or SVG
- **THEN** the image SHALL not contain the badge

### Requirement: Any writable client edits or deletes a comment

Each comment in the panel SHALL offer edit and delete on a writable client, whichever client wrote it. Editing SHALL replace the text in place and set the time of the last edit. Escape SHALL cancel an edit and keep the old text. Deleting SHALL remove the comment from the map without a confirmation. When two clients edit the same comment at once, the last write SHALL win.

#### Scenario: Edit a comment

- **GIVEN** node A holds the comment "Check the numbers"
- **WHEN** a user on another client edits it to "Numbers checked" and saves
- **THEN** every client SHALL show "Numbers checked" with the edited note

#### Scenario: Cancel an edit

- **GIVEN** the user edits a comment
- **WHEN** the user presses Escape
- **THEN** the comment SHALL keep its old text

#### Scenario: Delete a comment

- **WHEN** a user deletes a comment of node A
- **THEN** no client SHALL list the comment

### Requirement: Comment actions stay out of the undo history

Adding, editing and deleting a comment SHALL NOT be recorded by undo. Undo and redo SHALL NOT add, change or delete a comment directly.

#### Scenario: Undo after adding a comment

- **GIVEN** the user renames node A and then adds a comment to A
- **WHEN** the user presses undo
- **THEN** the rename of A SHALL be reverted
- **AND** the comment SHALL stay

### Requirement: Comments of a removed node hide and return on undo

Removing a node SHALL keep the comments of the node and of its descendants in the map. A client SHALL show no comment whose node does not exist. When undo or redo restores such a node, its comments SHALL show again, with their text and times unchanged. This SHALL hold for a removal by a peer and for cutting a node. A pasted node SHALL start without comments.

#### Scenario: Comments hidden after removal

- **GIVEN** node A holds a comment and has child B holding a comment
- **WHEN** a user removes A
- **THEN** no client SHALL show either comment

#### Scenario: Undo restores comments

- **GIVEN** a user removed node A that held two comments
- **WHEN** that user presses undo
- **THEN** A SHALL show its badge on every client
- **AND** the comment panel for A SHALL list both comments

#### Scenario: Redo hides them again

- **GIVEN** the removal of A was undone
- **WHEN** the user presses redo
- **THEN** no client SHALL show the comments of A

#### Scenario: Cut and paste

- **GIVEN** node A holds a comment
- **WHEN** the user cuts A and pastes it elsewhere
- **THEN** the pasted node SHALL hold no comments
- **AND** undoing the cut SHALL show the comment on A again

### Requirement: Comments are stored with the map and copied on duplication

Comments SHALL be stored with the map and SHALL load when any client opens it later. Only comments whose node exists SHALL be stored, so the comments of a removed node are lost once no client holds the map open. Duplicating a map SHALL copy its comments to the new map. Deleting a map, by its admin or by the cleanup of outdated maps, SHALL delete all of its comments from the database.

#### Scenario: Comments survive a reload

- **GIVEN** node A holds a comment and every client closes the map
- **WHEN** a client opens the map
- **THEN** A SHALL show the badge and the comment

#### Scenario: Removed node's comments dropped after the session

- **GIVEN** a user removed node A that held a comment, and every client closed the map
- **WHEN** a client opens the map
- **THEN** the map SHALL hold no comment for A

#### Scenario: Duplicate a map

- **GIVEN** node A holds a comment
- **WHEN** a user duplicates the map
- **THEN** A in the new map SHALL hold the same comment

#### Scenario: Delete a map

- **GIVEN** the map holds comments
- **WHEN** the map is deleted by its admin or by the cleanup of outdated maps
- **THEN** the database SHALL hold no comment of that map
