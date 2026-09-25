## ADDED Requirements

### Requirement: Comments map stays out of the undo scope

The `Y.UndoManager` SHALL track the `nodes` map only and SHALL NOT track the `comments` map. Comment writes use the origin `'comment'`, which is not in `trackedOrigins`. Removing a node SHALL NOT delete its comments, so undoing the removal needs no comment write to make them show again.

#### Scenario: Comment write not captured

- **WHEN** the user adds, edits or deletes a comment
- **THEN** the undo stack SHALL be unchanged

#### Scenario: Node removal leaves comments

- **GIVEN** node A holds a comment
- **WHEN** the user removes A
- **THEN** the `comments` map SHALL still hold the comment
- **AND** undo SHALL restore A through the `nodes` map alone
