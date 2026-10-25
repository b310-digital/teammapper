## ADDED Requirements

### Requirement: Persist and hydration keep the name format

`mmp_node` SHALL hold a nullable `nameFormat` column. Persistence SHALL write each node's `nameFormat`, hydration SHALL read it into the node entry, and map duplication SHALL copy it. A null column SHALL hydrate as `text`.

#### Scenario: Round trip

- **WHEN** a markdown node is persisted and the map is hydrated again
- **THEN** the node entry SHALL hold `nameFormat` set to `markdown`

#### Scenario: Row from before the change

- **WHEN** a node row with a null `nameFormat` is hydrated
- **THEN** the node entry SHALL hold `nameFormat` set to `text`
