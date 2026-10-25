## ADDED Requirements

### Requirement: The node entry carries the name format

Each node entry in the `nodes` map SHALL hold `nameFormat` as a top-level field with the value `text` or `markdown`. A reader SHALL treat a missing field as `text`. A client SHALL keep a `nameFormat` it did not write when it rewrites other fields of the entry. Converting a text name SHALL change `name`, `font` and `nameFormat` in one transaction.

#### Scenario: Format reaches a peer

- **WHEN** client A creates a markdown node
- **THEN** client B SHALL hold the node with `nameFormat` set to `markdown` and render its markdown

#### Scenario: Entry without the field

- **WHEN** a client reads a node entry with no `nameFormat`
- **THEN** it SHALL render the name as a text name
