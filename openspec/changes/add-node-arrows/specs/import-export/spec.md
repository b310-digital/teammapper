## MODIFIED Requirements

### Requirement: User can import a mind map from a JSON file

The system SHALL allow users to import a mind map by uploading a JSON file. The imported map SHALL replace the current map and display the nodes and arrows defined in the file. The system SHALL accept a file holding an object with `nodes` and `arrows`, and a file holding a bare node list, which imports with no arrows. The system SHALL drop every imported arrow that names a missing node or breaks an endpoint rule.

#### Scenario: Upload JSON file for import

- **WHEN** the user selects JSON import and uploads a valid JSON map file
- **THEN** the imported nodes SHALL be visible on the map
- **AND** each expected node SHALL appear exactly once

#### Scenario: Import a file with arrows

- **WHEN** the user imports a JSON file holding nodes and arrows
- **THEN** every arrow in the file SHALL be drawn between its nodes
- **AND** every arrow the map held before the import SHALL be gone

#### Scenario: Import a node list from an older version

- **WHEN** the user imports a JSON file holding a bare node list
- **THEN** the nodes SHALL be imported
- **AND** the map SHALL hold no arrows

#### Scenario: Import drops invalid arrows

- **WHEN** the imported file holds an arrow naming a node the file does not hold
- **THEN** the system SHALL import every other node and arrow and leave that arrow out

#### Scenario: Mermaid import clears arrows

- **GIVEN** a map with arrows
- **WHEN** the user imports a Mermaid file with two `mindmap` blocks
- **THEN** the map SHALL hold both imported trees and no arrows

## ADDED Requirements

### Requirement: JSON export includes arrows

JSON export SHALL write an object with `nodes`, the node list, and `arrows`, every arrow of the map with its source and target.

#### Scenario: Round trip

- **GIVEN** a map with arrows
- **WHEN** the user exports it as JSON and imports the file into another map
- **THEN** the other map SHALL hold the same arrows between the same nodes

### Requirement: Arrows in other export formats

SVG, PNG, JPEG and PDF export SHALL show every arrow the map draws. Mermaid export SHALL leave arrows out, because Mermaid `mindmap` syntax has no such relation.

#### Scenario: Image export shows arrows

- **WHEN** the user exports a map with arrows as PNG
- **THEN** the image SHALL show the arrows

#### Scenario: Mermaid export drops arrows

- **WHEN** the user exports a two-tree map with an arrow between the trees as Mermaid
- **THEN** the output SHALL hold one `mindmap` block per tree with every node
- **AND** the output SHALL hold no arrow
