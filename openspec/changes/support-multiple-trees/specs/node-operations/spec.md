## MODIFIED Requirements

### Requirement: User can add and remove child nodes
The system SHALL allow users to add a child node to the currently selected node via an add button, and remove a selected node via a remove button. The add button SHALL accept any selected node as a parent, including a root. Removing a node SHALL remove its descendants with it.

#### Scenario: Add a child node
- **WHEN** the user clicks the add node button and types a node name
- **THEN** the new node SHALL appear on the map

#### Scenario: Remove a node
- **WHEN** the user selects a node and clicks the remove node button
- **THEN** the node SHALL no longer be visible on the map

#### Scenario: Add a child to a root outside the main tree
- **WHEN** the user selects a root that does not carry the main-root mark and clicks the add node button
- **THEN** the new node SHALL attach to that root as a child

#### Scenario: Remove a node with descendants
- **WHEN** the user removes a node that has two descendants
- **THEN** the node and both descendants SHALL disappear from the map

## ADDED Requirements

### Requirement: User can create a tree from the toolbar
The system SHALL provide an add-tree button in place of the add-detached-node button. The button SHALL create a root with no parent, no children and no main-root mark, and SHALL stay enabled when no node is selected.

#### Scenario: Create a tree
- **WHEN** the user clicks the add-tree button and types a name
- **THEN** a new root SHALL appear on the map, clear of the trees the client holds
- **AND** the new root SHALL accept children

#### Scenario: Create a tree with nothing selected
- **WHEN** no node is selected and the user clicks the add-tree button
- **THEN** a new root SHALL appear on the map
