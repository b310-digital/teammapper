## MODIFIED Requirements

### Requirement: Map import via Y.Doc transaction

When a user imports a map, the bridge SHALL clear the Y.Doc `nodes` map and the `comments` map and repopulate `nodes` with the imported data inside a single `yDoc.transact()` call. Yjs SHALL sync the new state to all connected clients automatically.

#### Scenario: User imports a map

- **WHEN** the user triggers a map import with new map data
- **THEN** the bridge SHALL execute a Y.Doc transaction that deletes all entries from the `nodes` map and adds all imported nodes as new entries
- **AND** all connected clients SHALL receive the Y.Doc update and re-render via their bridge observers

#### Scenario: Import clears comments

- **GIVEN** the map holds comments
- **WHEN** the user imports a map
- **THEN** the same transaction SHALL delete every entry of the `comments` map
