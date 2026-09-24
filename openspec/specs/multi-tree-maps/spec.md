# multi-tree-maps Specification

## Purpose

Defines maps that hold several trees: how roots are marked, laid out, placed, copied, deleted and saved.

## Requirements

### Requirement: A map holds any number of trees
A map SHALL hold any number of trees. A node with no parent SHALL be a root, and a root SHALL accept children to any depth. Exactly one root per map SHALL carry the main-root mark, stored as `isRoot`.

#### Scenario: Second root accepts children
- **WHEN** the user creates a tree and adds a child to its root
- **THEN** the child SHALL attach to that root
- **AND** the child SHALL accept children of its own

#### Scenario: Map created with one tree
- **WHEN** a user creates a new mind map
- **THEN** the map SHALL contain one root node carrying the main-root mark

#### Scenario: Root loaded while another node is selected
- **GIVEN** the user has selected a node in the main tree
- **WHEN** a root outside the main tree arrives by sync or map load
- **THEN** that root SHALL have a null parent
- **AND** the selected node SHALL gain no child

### Requirement: Root status derives from the parent reference
The system SHALL treat a node as a root when its parent reference is null. No stored flag SHALL declare root status. The main-root mark SHALL identify the one node per map that the system protects, and SHALL NOT be read as an answer to whether a node has a parent.

#### Scenario: Main root is a root
- **WHEN** the system loads a map
- **THEN** the node carrying the main-root mark SHALL have a null parent

#### Scenario: Added tree carries no main-root mark
- **WHEN** the user creates a second tree
- **THEN** the new root SHALL have a null parent and SHALL NOT carry the main-root mark

### Requirement: Every tree uses the same layout
The system SHALL lay out every tree with the branching, column spacing, alignment and branch colors it applies to the main tree, arranged around that tree's own root. The system SHALL measure which side of its tree a node sits on against the root of that node's own tree.

#### Scenario: Second tree branches both ways
- **WHEN** a root outside the main tree has four children
- **THEN** the children SHALL be split between the left and the right of that root
- **AND** the column distances SHALL match those of the main tree at the same depth

#### Scenario: Side measured against the own tree root
- **GIVEN** a second tree whose root sits right of the main tree
- **WHEN** the user adds a child on the left of that root
- **THEN** the system SHALL treat the child as a left-side node of its tree
- **AND** the child's own children SHALL extend further left

#### Scenario: Branch colors follow the setting
- **GIVEN** automatic branch colors are on
- **WHEN** the user adds two children to a root outside the main tree
- **THEN** each child SHALL receive a distinct branch color, as the main root's children do
- **AND** the descendants of each child SHALL inherit that child's color

#### Scenario: Branch colors without the setting
- **GIVEN** automatic branch colors are off
- **WHEN** the user adds a child to a root outside the main tree
- **THEN** the child SHALL receive the same branch color a child of the main root receives

### Requirement: A new tree is placed clear of the trees at creation
The client that creates a tree SHALL place its root clear of the bounding box of every tree that client holds, and SHALL store the root's coordinates. The system SHALL keep every root at its stored coordinates. The system SHALL NOT move a tree to keep it clear of others after creation.

#### Scenario: New tree avoids the existing trees
- **WHEN** the user creates a tree on a map that already shows two trees
- **THEN** the new tree's bounding box SHALL NOT overlap either existing bounding box

#### Scenario: First child of a new tree stays clear
- **WHEN** the user creates a tree and adds one child narrower than two horizontal spacings to its root
- **THEN** the new tree's bounding box, child included, SHALL NOT overlap the bounding box of any other tree

#### Scenario: Dragged tree keeps its position
- **GIVEN** the user dragged a tree to a chosen position
- **WHEN** the map re-renders
- **THEN** that tree SHALL remain at the chosen position

#### Scenario: Growing tree moves no neighbor
- **WHEN** a tree grows until its bounding box overlaps another tree
- **THEN** neither root SHALL move

### Requirement: Deleting a root deletes its tree
The system SHALL delete a root together with all of its descendants. The system SHALL refuse to delete the node carrying the main-root mark, whether or not other trees exist.

#### Scenario: Delete a tree
- **WHEN** the user selects a root outside the main tree and removes it
- **THEN** that root and every descendant SHALL disappear from the map
- **AND** the other trees SHALL remain unchanged

#### Scenario: Main root cannot be deleted
- **WHEN** the user selects the node carrying the main-root mark and triggers remove
- **THEN** the node SHALL remain on the map

### Requirement: Copying a root copies its tree
The system SHALL copy a root that does not carry the main-root mark together with its descendants, and SHALL refuse to copy or cut the main root. Pasting SHALL attach the copied nodes under the selected node. Pasting with no node selected SHALL create an independent tree. No pasted node SHALL carry the main-root mark.

#### Scenario: Copy and paste a tree
- **WHEN** the user copies a root with two descendants, deselects, and pastes
- **THEN** a new tree with three nodes SHALL appear
- **AND** the new tree SHALL be placed clear of the trees the client holds
- **AND** the new root SHALL NOT carry the main-root mark

#### Scenario: Paste a tree onto a selected node
- **WHEN** the user copies a root and pastes with a node selected
- **THEN** the copied nodes SHALL attach under the selected node as a subtree
- **AND** no pasted node SHALL carry the main-root mark

#### Scenario: Paste onto the selected main root
- **WHEN** the user selects the main root and pastes
- **THEN** the copied nodes SHALL attach under the main root

#### Scenario: Main root cannot be copied
- **WHEN** the user selects the node carrying the main-root mark and triggers copy or cut
- **THEN** the clipboard SHALL remain unchanged
- **AND** the node SHALL remain on the map

### Requirement: Saving orders every node parent-first
When the system saves a map, it SHALL order nodes so that every parent precedes its children, across all trees, with the main root first. The system SHALL leave out a node that no root reaches, because its parent is missing or its ancestors form a cycle, and SHALL still write every other node.

#### Scenario: Two-tree map saves
- **WHEN** a map with two trees is saved
- **THEN** every node SHALL be written after its parent
- **AND** the save SHALL succeed

#### Scenario: Node with a missing parent
- **WHEN** a map contains a node whose parent reference names no existing node
- **THEN** the system SHALL write every other node in parent-first order
- **AND** the system SHALL NOT store that node or its descendants

### Requirement: Existing detached nodes become trees
The system SHALL treat every node stored as detached as a root with no main-root mark, at its stored coordinates. The system SHALL NOT store the detached property and SHALL NOT create further detached nodes.

#### Scenario: Detached node after the migration
- **GIVEN** a map saved with one detached node
- **WHEN** the migration runs and a user opens the map
- **THEN** that node SHALL render as a root at its stored coordinates
- **AND** the user SHALL be able to add children to it

#### Scenario: Detached node with pasted descendants
- **GIVEN** a map saved with a detached node that holds a pasted subtree
- **WHEN** the migration runs and a user opens the map
- **THEN** the detached node and its subtree SHALL render as one tree at their stored coordinates
- **AND** the Mermaid export SHALL include that tree

#### Scenario: Detached node stored with a parent
- **GIVEN** a stored detached node whose parent reference names a node
- **WHEN** the migration runs
- **THEN** that node's parent reference SHALL be null
