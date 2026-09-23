## MODIFIED Requirements

### Requirement: Full property fidelity on undo/redo of delete
When a node (or subtree) is deleted and the deletion is undone, the system SHALL restore every node property stored in the Y.Doc: coordinates, colors, font, image, link, parent reference, k value, locked state, and main-root mark. The redo of such an undo (re-delete) and subsequent undo (re-restore) SHALL also preserve full property fidelity.

#### Scenario: Undo of single node delete restores all properties
- **GIVEN** a node exists with `coordinates: {x: 200, y: -120}`, `colors: {name: '#000', background: '#fff', branch: '#333'}`, and `k: -1`
- **WHEN** the node is deleted and the user triggers undo
- **THEN** the Y.Doc SHALL contain the restored node with ALL original properties intact
- **AND** `coordinates` SHALL be `{x: 200, y: -120}` (not recalculated)
- **AND** `k` SHALL be `-1` (preserving left/right orientation)

#### Scenario: Undo of subtree delete restores parent and all descendants
- **GIVEN** node `A` has child `B`, and `B` has child `C`
- **AND** all three nodes have distinct coordinates and properties
- **WHEN** `A` is deleted (which cascades to `B` and `C` in a single transaction)
- **AND** the user triggers undo
- **THEN** the Y.Doc SHALL contain all three nodes with their original properties
- **AND** `B.parent` SHALL be `A.id` and `C.parent` SHALL be `B.id`

#### Scenario: Undo of a tree delete restores the root without a parent
- **GIVEN** a root `R` that does not carry the main-root mark has child `S`
- **WHEN** `R` is deleted and the user triggers undo
- **THEN** the Y.Doc SHALL contain `R` with a null parent and no main-root mark
- **AND** `S.parent` SHALL be `R.id`

#### Scenario: Multiple undo/redo cycles preserve properties
- **GIVEN** a node exists with specific coordinates and properties
- **WHEN** the node is deleted, then undo, then redo (re-delete), then undo (re-restore)
- **THEN** after the final undo, the node's properties in Y.Doc SHALL match the original values exactly
