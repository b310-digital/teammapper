## ADDED Requirements

### Requirement: User can change the application language
The system SHALL provide a language dropdown on the settings page with multiple language options. Users SHALL be able to select a different language.

#### Scenario: Select a different language
- **WHEN** the user navigates to settings and selects a language from the dropdown
- **THEN** the language selection SHALL be accepted

### Requirement: User can modify map options
The system SHALL provide a Map Options tab in settings with toggles and input fields. Users SHALL be able to toggle auto branch colors and configure minimum and maximum font sizes.

#### Scenario: Toggle auto branch colors and change font sizes
- **WHEN** the user opens the Map Options tab, toggles auto branch colors, sets min font size to 20 and max font size to 80, and closes settings
- **THEN** the map SHALL be displayed without errors
