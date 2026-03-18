## ADDED Requirements

### Requirement: First-level branches have distinct colors
The system SHALL assign different colors to branches connecting first-level child nodes to the root. Each first-level branch SHALL have a unique color.

#### Scenario: Two first-level branches have different colors
- **WHEN** two child nodes are added directly to the root node
- **THEN** their branch connectors SHALL have different fill colors

### Requirement: Child nodes inherit their parent's branch color
The system SHALL assign child branches the same color as their parent's branch. All children of the same parent SHALL share the same branch color.

#### Scenario: Second-level node inherits parent branch color
- **WHEN** a child node is added to a first-level branch node
- **THEN** the child's branch color SHALL match the parent's branch color

#### Scenario: Multiple children of the same parent share branch color
- **WHEN** multiple child nodes are added to the same first-level branch
- **THEN** all their branch colors SHALL be identical to the parent's branch color
