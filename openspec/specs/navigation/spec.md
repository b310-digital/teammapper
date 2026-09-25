# navigation Specification

## Purpose

Defines how users move from the map view to the settings page and back.

## Requirements

### Requirement: User can navigate to settings and back to the map
The system SHALL provide a settings navigation button that opens the settings page. While on the settings page, the map SHALL not be rendered. A close action SHALL return the user to the map view.

#### Scenario: Navigate to settings and return
- **WHEN** the user navigates to settings
- **THEN** the settings page SHALL be visible and the map SHALL not be present
- **WHEN** the user closes settings
- **THEN** the map SHALL be visible again
