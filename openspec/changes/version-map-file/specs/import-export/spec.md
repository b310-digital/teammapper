## ADDED Requirements

### Requirement: JSON export writes the map file version

A JSON export SHALL write the field `version` with the current map file version, 2, next to `nodes` and `arrows`.

#### Scenario: Export a map as JSON

- **WHEN** the user exports a map as JSON
- **THEN** the file SHALL hold `version: 2`

### Requirement: JSON import reads a file by its map file version

The JSON import SHALL read a bare node list as version 1 and an object with a `nodes` list as version 2, whether or not the object declares `version`. A version 1 node MAY lack `link`, `isRoot` and `coordinates`, and the import SHALL lay out a node without coordinates. A version 2 node SHALL carry all three. Every node id SHALL be a UUID. The import SHALL reject an object whose `version` is an integer above 2 with a message that a newer release wrote the file, and SHALL reject any other `version` value besides 2 with the generic import error.

#### Scenario: Import a version 1 node list

- **WHEN** the user imports a JSON file holding a bare node list whose nodes lack `link`, `isRoot` and `coordinates`
- **THEN** the import SHALL succeed

#### Scenario: Import an export object without a version

- **WHEN** the user imports a JSON file holding `nodes` and `arrows` and no `version`
- **THEN** the import SHALL read it as version 2 and succeed

#### Scenario: Import a declared version 2 file

- **WHEN** the user imports a JSON file holding `version: 2`
- **THEN** the import SHALL succeed

#### Scenario: Import a file from a newer release

- **WHEN** the user imports a JSON file holding `version: 3`
- **THEN** the import SHALL leave the map unchanged
- **AND** the user SHALL see a message that a newer TeamMapper version created the file

#### Scenario: Import a node id that is no UUID

- **WHEN** the user imports a JSON file holding a node whose id is no UUID
- **THEN** the import SHALL leave the map unchanged
- **AND** the user SHALL see the generic import error
