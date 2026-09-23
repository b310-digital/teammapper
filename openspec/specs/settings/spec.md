# settings Specification

## Purpose

Change the application language, user settings and map options.

## Requirements

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

### Requirement: Settings Page Navigation
The system SHALL provide a settings page accessible from the editor toolbar, organized into tabs.

#### Scenario: Open settings
- **WHEN** the user clicks the settings button or presses alt+s in the map editor
- **THEN** the settings page SHALL be displayed at `/app/settings`

#### Scenario: Tab structure
- **WHEN** the settings page loads
- **THEN** three tabs SHALL be available: "General", "Map options", "List of created maps"

#### Scenario: Close settings
- **WHEN** the user clicks the close (X) button on the settings page
- **THEN** the user SHALL be returned to the map editor

### Requirement: Map Options (detailed)
The system SHALL provide detailed map-specific configuration options beyond the basic toggle and font size range.

#### Scenario: Center on resizing
- **WHEN** the Map options tab is active
- **THEN** a "Center on resizing" toggle SHALL be displayed (default: off), described as "Centers the map on window resizing"

#### Scenario: Font size step
- **WHEN** the Map options tab is active
- **THEN** spinbutton inputs SHALL be displayed for "Minimal font size" (default: 15), "Maximal font size" (default: 70), and "Font size step" (default: 5)

#### Scenario: Default node names
- **WHEN** the Map options tab is active
- **THEN** a "Nodes" section SHALL display text inputs for "Root node name" (default: "Root node") and "Node name" (placeholder: "Node name")

#### Scenario: Show linktext
- **WHEN** the Map options tab is active
- **THEN** a "Links" section SHALL display a "Show linktext" toggle described as "Show the linktext instead of the link icon" (default: off)

### Requirement: List of Created Maps
The system SHALL display a list of recently opened mind maps in a dedicated settings tab.

#### Scenario: Map list
- **WHEN** the "List of created maps" tab is active
- **THEN** a "Recently opened mindmaps" section SHALL list previously opened maps

#### Scenario: Map entry details
- **WHEN** a map is displayed in the list
- **THEN** each entry SHALL show the root node name as a clickable link and the text "Last known date of deletion: {date}"

#### Scenario: Navigate to map
- **WHEN** the user clicks a map entry link
- **THEN** they SHALL be navigated to that map

### Requirement: Dark Mode Configuration & Persistence
The system SHALL store the user's dark mode preference as part of `userSettings.general.darkMode`. The preference SHALL be persisted locally across browser sessions and reflected in application state.

#### Scenario: First visit initializes dark mode from system preference
- **WHEN** a user visits TeamMapper without existing stored settings
- **AND** the operating system or browser indicates `prefers-color-scheme: dark`
- **THEN** `userSettings.general.darkMode` SHALL be initialized to `true`
- **AND** the dark mode theme SHALL be applied immediately to the document

#### Scenario: First visit with light system preference
- **WHEN** a user visits TeamMapper without existing stored settings
- **AND** the operating system or browser does not indicate dark mode preference
- **THEN** `userSettings.general.darkMode` SHALL be initialized to `false`
- **AND** the default light theme SHALL remain active

#### Scenario: Existing user settings without darkMode property (Migration)
- **WHEN** a user with previously cached settings from an older version opens the application
- **AND** `loadedSettings.general.darkMode` is `undefined`
- **THEN** the system SHALL fall back to the system preference (`prefers-color-scheme: dark`)
- **AND** the migrated settings SHALL be saved to local storage

### Requirement: Dark Mode Setting Toggle in User Interface
The system SHALL provide a dedicated toggle control for Dark Mode on the General tab of the Settings page (`/app/settings`).

#### Scenario: Toggle dark mode on
- **WHEN** the user navigates to `/app/settings`
- **AND** toggles the "Dark mode" switch to enabled
- **THEN** the application theme SHALL immediately switch to dark mode without requiring a page reload
- **AND** the `dark-mode` class SHALL be added to `document.body`
- **AND** the updated setting SHALL be persisted in storage

#### Scenario: Toggle dark mode off
- **WHEN** the user toggles the "Dark mode" switch to disabled
- **THEN** the application theme SHALL immediately switch back to light mode
- **AND** the `dark-mode` class SHALL be removed from `document.body`
- **AND** the updated setting SHALL be persisted in storage

#### Scenario: Dark mode toggle localization
- **WHEN** the settings page is displayed in any supported language (en, de, es, fr, it, ja, pt-br, zh-cn, zh-tw)
- **THEN** the label for the dark mode toggle SHALL be translated using the key `PAGES.SETTINGS.DARK_MODE`

