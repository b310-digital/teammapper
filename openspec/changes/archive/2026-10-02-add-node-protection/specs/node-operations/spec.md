## MODIFIED Requirements

### Requirement: User can drag nodes to reposition them

The system SHALL allow users to drag nodes to new positions on the map. The node's visual position SHALL change after dragging. Dragging a node SHALL move all its descendants along. The system SHALL refuse dragging a protected node.

#### Scenario: Drag a node to a new position

- **WHEN** the user drags a node to a different location
- **THEN** the map layout SHALL visually change to reflect the new position

#### Scenario: Descendants move along

- **GIVEN** node A has child B
- **WHEN** the user drags A
- **THEN** B SHALL keep its position relative to A

#### Scenario: Group toggle is gone

- **WHEN** the user selects a node
- **THEN** the toolbar SHALL show no button that groups or ungroups the node
