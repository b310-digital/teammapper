## ADDED Requirements

### Requirement: User can undo the last action
The system SHALL provide an undo action that reverts the most recent operation. When a node addition is undone, the added node SHALL no longer be visible.

#### Scenario: Undo a node addition
- **WHEN** the user adds a node and triggers undo
- **THEN** the added node SHALL no longer be visible

### Requirement: User can redo an undone action
The system SHALL provide a redo action that restores the most recently undone operation. When a node addition undo is redone, the node SHALL reappear.

#### Scenario: Redo an undone node addition
- **WHEN** the user undoes a node addition and triggers redo
- **THEN** the node SHALL be visible again
