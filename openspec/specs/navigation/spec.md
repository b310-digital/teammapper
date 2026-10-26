# navigation Specification

## Purpose

Defines how users open the settings dialog over the map and close it again.

## Requirements

### Requirement: User can open the settings dialog over the map
The system SHALL provide a settings button in the toolbar and the `alt+s` shortcut, both of which open the settings dialog over the map. The map SHALL stay drawn behind the dialog and the URL SHALL not change. At most one settings dialog SHALL be open at a time. Map shortcuts SHALL not act while the dialog is open. A close action SHALL close the dialog and leave the map in view.

#### Scenario: Open the settings dialog and close it
- **WHEN** the user clicks the settings button
- **THEN** the settings dialog SHALL be visible, the map SHALL stay present, and the URL SHALL stay the same
- **WHEN** the user clicks the close button
- **THEN** the dialog SHALL close and the map SHALL stay visible

#### Scenario: Open the settings dialog with the keyboard
- **WHEN** the user presses `alt+s` twice
- **THEN** exactly one settings dialog SHALL be open

#### Scenario: Map shortcuts rest while the dialog is open
- **WHEN** the settings dialog is open and the user presses a map shortcut
- **THEN** the map SHALL not change
