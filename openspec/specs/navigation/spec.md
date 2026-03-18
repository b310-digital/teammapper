## ADDED Requirements

### Requirement: User can navigate to settings and back to the map
The system SHALL provide a settings navigation button that opens the settings page. While on the settings page, the map SHALL not be rendered. A close action SHALL return the user to the map view.

#### Scenario: Navigate to settings and return
- **WHEN** the user navigates to settings
- **THEN** the settings page SHALL be visible and the map SHALL not be present
- **WHEN** the user closes settings
- **THEN** the map SHALL be visible again

### Requirement: User can navigate to the shortcuts page
The system SHALL provide a shortcuts navigation button that navigates to the keyboard shortcuts page.

#### Scenario: Navigate to shortcuts page
- **WHEN** the user clicks the shortcuts navigation button
- **THEN** the application SHALL navigate to the shortcuts page
