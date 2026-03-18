## ADDED Requirements

### Requirement: User can create a new mind map
The system SHALL allow users to create a new mind map from the home page. Upon creation, the map SHALL be displayed with a default root node labeled "Root node".

#### Scenario: Create mind map from home page
- **WHEN** the user clicks "Create mind map"
- **THEN** a mind map SHALL be displayed with a root node labeled "Root node"

### Requirement: Nodes are persisted across page reloads
The system SHALL persist newly added nodes to the backend. When the page is reloaded, all previously added nodes SHALL be retrieved and displayed.

#### Scenario: Added node survives page reload
- **WHEN** the user adds a new node and reloads the page
- **THEN** the added node SHALL still be visible after reload
