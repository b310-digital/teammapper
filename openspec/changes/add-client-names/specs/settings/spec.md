## ADDED Requirements

### Requirement: Display name setting

The "General" tab of the settings page SHALL provide a text field for the display name, with a hint that everyone on a map can see it. A change SHALL store the normalized value in the general user settings and apply to every open client of the browser without a reload.

#### Scenario: Set the display name in settings

- **WHEN** the user opens the settings page, types "Vorname Test" into the display name field and closes the settings
- **THEN** the own client icon in the map's client list SHALL show "VT"

#### Scenario: Name reaches the other open tabs

- **GIVEN** the user has the same map open in two tabs of one browser
- **WHEN** the user sets the display name "Vorname Test" in the first tab
- **THEN** the own client icon in the second tab SHALL show "VT" without a reload
- **AND** a later change of another setting in the second tab SHALL keep the name "Vorname Test"

#### Scenario: Field shows the current name

- **GIVEN** the user has set the display name "Vorname Test" from the client list
- **WHEN** the user opens the "General" tab
- **THEN** the display name field SHALL hold "Vorname Test"

#### Scenario: Clear the display name

- **WHEN** the user empties the display name field
- **THEN** the display name SHALL be empty
- **AND** the own client icon SHALL show the generic client icon

#### Scenario: Field is translated

- **WHEN** the user switches the application language
- **THEN** the label and the hint of the display name field SHALL appear in that language
