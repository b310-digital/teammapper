## ADDED Requirements

### Requirement: Display name setting

The "General" tab of the settings page SHALL provide a text field for the display name, with a hint that everyone on a map can see it. A change SHALL store the normalized value in the general user settings and apply to every open client of the browser without a reload.

#### Scenario: Set the display name in settings

- **WHEN** the user opens the settings page, types "Anna Schmidt" into the display name field and closes the settings
- **THEN** the own client icon in the map's client list SHALL show "AS"

#### Scenario: Field shows the current name

- **GIVEN** the user has set the display name "Anna Schmidt" from the client list
- **WHEN** the user opens the "General" tab
- **THEN** the display name field SHALL hold "Anna Schmidt"

#### Scenario: Clear the display name

- **WHEN** the user empties the display name field
- **THEN** the display name SHALL be empty
- **AND** the own client icon SHALL show the generic client icon

#### Scenario: Field is translated

- **WHEN** the user switches the application language
- **THEN** the label and the hint of the display name field SHALL appear in that language
