## ADDED Requirements

### Requirement: User protects a branch

A writable client SHALL protect the selected node and every node below it through the lock button in the toolbar. The protection SHALL be stored on the selected node and SHALL sync to every connected client, including read-only ones, so every client sees the branch as completed. A node SHALL count as protected when it or any ancestor carries the protection. Protecting a node SHALL remove the protection from every descendant that carried its own. The main root SHALL be protectable.

#### Scenario: Protect a branch

- **GIVEN** node A with children B and C, none protected
- **WHEN** the user selects A and presses the lock button
- **THEN** A, B and C SHALL be protected on every client

#### Scenario: Peer's protection applies locally

- **GIVEN** client 1 and client 2 have the map open
- **WHEN** client 1 protects A
- **THEN** client 2 SHALL show A as protected without a reload
- **AND** client 2 SHALL refuse its user's edits inside the branch of A

#### Scenario: Client joining later

- **GIVEN** A is protected
- **WHEN** a client opens the map
- **THEN** that client SHALL show A as protected

#### Scenario: New child of a protected node

- **GIVEN** A is protected
- **WHEN** a peer's write adds a child D below A
- **THEN** D SHALL be protected

#### Scenario: Protecting a parent absorbs a protected child

- **GIVEN** B, a child of A, is protected
- **WHEN** the user protects A
- **THEN** A SHALL carry the protection
- **AND** B SHALL no longer carry its own

#### Scenario: Nothing selected or read-only

- **GIVEN** no node is selected, or the client is not writable
- **THEN** the lock button SHALL be disabled

### Requirement: Any writable client releases a protection

When the selected node is protected, the lock button SHALL show "release protection". Pressing it SHALL remove the protection from the node that carries it, which releases the whole branch. Any writable client SHALL be able to release a protection, whoever set it.

#### Scenario: Release from a descendant

- **GIVEN** A is protected and has child B
- **WHEN** a user on another client selects B and presses the lock button
- **THEN** A and B SHALL no longer be protected on every client

### Requirement: A protected branch refuses accidental edits

A client SHALL refuse the following local actions on a protected node and SHALL show a notice that the branch is protected: rename, change of colors, font, image or link, drag, adding a child, pasting into it, removing it and cutting it. A client SHALL refuse removing or cutting a node whose subtree holds a protected node. Refused actions SHALL change nothing in the map.

#### Scenario: Rename refused

- **GIVEN** B is protected
- **WHEN** the user tries to edit the name of B
- **THEN** the name SHALL stay unchanged
- **AND** the client SHALL show the protection notice

#### Scenario: Remove of an ancestor refused

- **GIVEN** B is protected and its parent A is not
- **WHEN** the user removes A
- **THEN** A and B SHALL stay in the map

#### Scenario: Drag of a protected node refused

- **GIVEN** B is protected
- **WHEN** the user drags B
- **THEN** B SHALL stay at its position

#### Scenario: Add child refused

- **GIVEN** B is protected
- **WHEN** the user adds a child to B or pastes onto B
- **THEN** no node SHALL be added

### Requirement: Protection does not block deliberate or remote changes

The protection check SHALL apply to local user actions only. A client SHALL apply writes from peers, undo, redo, redistribute and import inside a protected branch. Dragging an unprotected ancestor SHALL move a protected branch along. Copying, hiding and showing a protected node SHALL stay allowed. A pasted copy of a protected branch SHALL start unprotected.

#### Scenario: Peer write applies

- **GIVEN** B is protected on client 1
- **WHEN** client 2 renamed B before it received the protection
- **THEN** client 1 SHALL show the new name

#### Scenario: Undo inside a protected branch

- **GIVEN** the user renamed B, and a peer then protected B
- **WHEN** the user undoes
- **THEN** B SHALL show its previous name

#### Scenario: Drag an unprotected parent

- **GIVEN** A is not protected and its child B is
- **WHEN** the user drags A
- **THEN** B SHALL move along with A

#### Scenario: Paste a copy

- **GIVEN** A is protected
- **WHEN** the user copies A and pastes it onto an unprotected node
- **THEN** the pasted nodes SHALL not be protected

### Requirement: Protected branches show a lock badge

Every client SHALL draw a lock badge on each node that carries a protection. Descendants protected through it SHALL show no badge. The badge SHALL appear and disappear when a local or remote write changes the protection.

#### Scenario: Peer sees the badge

- **WHEN** client 1 protects A
- **THEN** client 2 SHALL draw a lock badge on A
- **AND** SHALL draw none on the children of A

### Requirement: Protection is stored with the map

The system SHALL persist the protection per node, keep it across reloads and map duplication, and write it to JSON export. Mermaid export SHALL drop it and Mermaid import SHALL create no protected node. Existing maps SHALL start with no node protected.

#### Scenario: Reload keeps protection

- **GIVEN** A is protected
- **WHEN** the map is reloaded after the server saved it
- **THEN** A SHALL still be protected

#### Scenario: Duplicate keeps protection

- **WHEN** a map with a protected node is duplicated
- **THEN** the same node of the duplicate SHALL be protected
