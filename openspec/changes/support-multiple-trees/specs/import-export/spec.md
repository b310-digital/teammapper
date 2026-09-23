## ADDED Requirements

### Requirement: Mermaid export writes one block per tree
The system SHALL export a map as one `mindmap` block per tree, since the Mermaid format allows a single root per block. The block for the main root SHALL come first, and a blank line SHALL separate consecutive blocks. The export SHALL include every node that a root reaches.

#### Scenario: Export a two-tree map
- **WHEN** the user exports a map holding two trees
- **THEN** the output SHALL contain two `mindmap` blocks
- **AND** the first block SHALL start with the main root
- **AND** each block SHALL contain the descendants of its own root

#### Scenario: Export a single-node tree
- **WHEN** a map holds a root with no children alongside the main tree
- **THEN** the output SHALL contain a `mindmap` block holding that root alone

#### Scenario: Round-trip a multi-tree map
- **WHEN** the user exports a map with three trees and imports the result
- **THEN** the map SHALL hold three trees with the same nodes
- **AND** the root of the first block SHALL carry the main-root mark

## MODIFIED Requirements

### Requirement: User can import a mind map from Mermaid syntax
The system SHALL open a dialog with a text area when the user selects the Mermaid import option. Users SHALL enter Mermaid mindmap syntax and trigger import. The import SHALL replace the current map. A document holding several `mindmap` blocks SHALL import as one tree per block, and only the root of the first block SHALL carry the main-root mark. On success, the dialog SHALL close and the nodes from the Mermaid syntax SHALL appear on the map. The dialog SHALL NOT include any AI generation functionality.

#### Scenario: Import Mermaid mindmap via dialog
- **WHEN** the user enters valid Mermaid mindmap syntax and clicks import
- **THEN** the dialog SHALL close
- **AND** all nodes defined in the Mermaid syntax SHALL be visible on the map

#### Scenario: Import a document with two mindmap blocks
- **WHEN** the user enters two `mindmap` blocks and clicks import
- **THEN** the map SHALL hold two trees and no node from before the import
- **AND** the root of the first block SHALL carry the main-root mark
- **AND** the root of the second block SHALL NOT carry the main-root mark
- **AND** the second tree SHALL be placed clear of the first

#### Scenario: Mermaid import dialog has no AI generation section
- **WHEN** the user opens the Mermaid import dialog
- **THEN** the dialog SHALL NOT display any AI description input field
- **AND** the dialog SHALL NOT display any AI generation button
