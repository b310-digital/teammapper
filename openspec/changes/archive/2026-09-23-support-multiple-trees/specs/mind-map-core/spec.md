## MODIFIED Requirements

### Requirement: Mind Map Canvas
The system SHALL render the mind map as an interactive SVG canvas with clickable nodes. The canvas SHALL render every tree on the map. Deselecting SHALL leave no node selected.

#### Scenario: Root node displayed
- **WHEN** a newly created map loads
- **THEN** a single "Root node" SHALL be displayed on the canvas
- **AND** the root node SHALL be selected

#### Scenario: Node selection
- **WHEN** the user clicks a node on the canvas
- **THEN** that node SHALL become selected and the toolbar buttons SHALL become enabled

#### Scenario: Deselect a node
- **WHEN** the user deselects the selected node
- **THEN** no node SHALL be selected, including the main root

#### Scenario: No selection state
- **WHEN** no node is selected
- **THEN** node-specific toolbar buttons (add, remove, copy, cut, bold, italic, link, image, pictogram, group, hide children) SHALL be disabled
- **AND** the add-tree button SHALL stay enabled
- **AND** the paste button SHALL stay enabled
- **AND** the other clients SHALL show no selection for this client

#### Scenario: Several trees rendered
- **WHEN** a map containing three trees loads
- **THEN** all three roots and their descendants SHALL be displayed on the canvas
