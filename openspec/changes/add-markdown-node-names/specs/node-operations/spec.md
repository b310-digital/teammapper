## MODIFIED Requirements

### Requirement: User can toggle bold and italic text styles on nodes

The system SHALL provide bold and italic toggle buttons. Styles SHALL be independently togglable and composable. The buttons SHALL depend on the editing state:

- **While the user edits a name**: bold and italic SHALL toggle formatting on the editor's selection, the same as Ctrl+B and Ctrl+I. A click on a button SHALL keep the editor open with its selection intact, and each button SHALL show the formatting at the caret.
- **While no name is being edited**: the buttons SHALL apply font styles to the selected node's whole text through `font.weight` and `font.style`, as before.

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

#### Scenario: Toggle bold on a selection while editing

- **GIVEN** the user edits a node named `Total net` and selects `net`
- **WHEN** the user clicks the bold button
- **THEN** `net` SHALL show in bold and the editor SHALL stay open with `net` selected
- **AND** after the edit ends, the name SHALL be `Total **net**`
- **AND** `font.weight` SHALL stay unchanged

#### Scenario: Button state follows the caret

- **GIVEN** the user edits a node named `**Total** net`
- **WHEN** the caret stands inside `Total`
- **THEN** the bold button SHALL show as active
- **AND** when the caret moves into `net`, the bold button SHALL show as inactive
