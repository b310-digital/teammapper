## ADDED Requirements

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
