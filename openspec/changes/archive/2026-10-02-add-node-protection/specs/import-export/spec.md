## MODIFIED Requirements

### Requirement: User can import a mind map from a JSON file

The system SHALL allow users to import a mind map by uploading a JSON file. The imported map SHALL replace the current map and display the nodes defined in the file. The import SHALL keep the `protected` field of each node, and SHALL import a node without that field unprotected. The import SHALL accept and ignore the `locked` field of older files.

#### Scenario: Upload JSON file for import

- **WHEN** the user selects JSON import and uploads a valid JSON map file
- **THEN** the imported nodes SHALL be visible on the map
- **AND** each expected node SHALL appear exactly once

#### Scenario: Import keeps protection

- **WHEN** the user imports a JSON file exported from a map with a protected node
- **THEN** that node SHALL be protected after the import

#### Scenario: Import an older file

- **WHEN** the user imports a JSON file whose nodes carry `locked` and no `protected`
- **THEN** the import SHALL succeed
- **AND** no node SHALL be protected
