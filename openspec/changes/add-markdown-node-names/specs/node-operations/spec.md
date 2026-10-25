## MODIFIED Requirements

### Requirement: User can toggle bold and italic text styles on nodes

The system SHALL provide bold and italic toggle buttons that apply font styles to the selected node's text. Styles SHALL be independently togglable and composable. On a text node the buttons SHALL set the deprecated `font.weight` and `font.style`. On a markdown node they SHALL edit the source instead: bold SHALL wrap the whole name in `**` or remove that wrapping when present, and italic SHALL do the same with `*`. On a markdown node a button SHALL show as active when the whole name carries its wrapping.

#### Scenario: Toggle bold on

- **WHEN** the user selects a node and activates bold
- **THEN** the node text SHALL render in bold

#### Scenario: Toggle italic on while bold is active

- **WHEN** bold is active and the user activates italic
- **THEN** the node text SHALL render in both bold and italic

#### Scenario: Toggle bold off leaving only italic

- **WHEN** both bold and italic are active and the user deactivates bold
- **THEN** the node text SHALL render in italic only

#### Scenario: Toggle italic off returning to normal

- **WHEN** only italic is active and the user deactivates italic
- **THEN** the node text SHALL render in normal style

#### Scenario: Toggle bold on a markdown node

- **GIVEN** a markdown node is named `Total`
- **WHEN** the user activates bold
- **THEN** the name SHALL be `**Total**`
- **AND** `font.weight` SHALL stay unchanged

#### Scenario: Toggle bold off on a markdown node

- **GIVEN** a markdown node is named `**Total**`
- **WHEN** the user deactivates bold
- **THEN** the name SHALL be `Total`
