## MODIFIED Requirements

### Requirement: User can modify map options

The system SHALL provide a Mind map tab in settings with toggles and input fields. Users SHALL be able to toggle auto branch colors and configure minimum and maximum font sizes.

#### Scenario: Toggle auto branch colors and change font sizes

- **WHEN** the user opens the Mind map tab, toggles auto branch colors, sets min font size to 20 and max font size to 80, and closes settings
- **THEN** the map SHALL be displayed without errors

### Requirement: Settings Dialog

The system SHALL provide a settings dialog that opens over the map from the editor toolbar, organized into tabs. The map SHALL stay drawn behind the dialog and SHALL take each change to the user settings at once. The app SHALL not create the map again when the dialog closes.

#### Scenario: Open settings

- **WHEN** the user clicks the settings button or presses alt+s in the map editor
- **THEN** the settings dialog SHALL open over the map and the URL SHALL not change

#### Scenario: Tab structure

- **WHEN** the settings dialog opens
- **THEN** three tabs SHALL be available: "General", "Mind map", "List of created maps"

#### Scenario: Close settings

- **WHEN** the user clicks the close (X) button in the settings dialog
- **THEN** the dialog SHALL close and the map editor SHALL stay in view

#### Scenario: Close on navigation

- **WHEN** the app navigates away while the settings dialog is open, such as after the user deletes the open map
- **THEN** the dialog SHALL close

#### Scenario: Apply user settings to the open map

- **WHEN** the user changes "Center on resizing", "Show linktext" or "Branch style" in the dialog
- **THEN** the open map SHALL use the new value without a reload

### Requirement: Map Options (detailed)

The system SHALL provide detailed map-specific configuration options beyond the basic toggle and font size range.

#### Scenario: Center on resizing

- **WHEN** the Mind map tab is active
- **THEN** a "Center on resizing" toggle SHALL be displayed (default: off), described as "Centers the map on window resizing"

#### Scenario: Font size step

- **WHEN** the Mind map tab is active
- **THEN** spinbutton inputs SHALL be displayed for "Minimal font size" (default: 15), "Maximal font size" (default: 70), and "Font size step" (default: 5)

#### Scenario: Default node names

- **WHEN** the Mind map tab is active
- **THEN** a "Nodes" section SHALL display text inputs for "Root node name" (default: "Root node") and "Node name" (placeholder: "Node name")

#### Scenario: Show linktext

- **WHEN** the Mind map tab is active
- **THEN** a "Links" section SHALL display a "Show linktext" toggle described as "Show the linktext instead of the link icon" (default: off)

## ADDED Requirements

### Requirement: Mind map tab separates map settings from user settings

The Mind map tab SHALL show its options in two groups, each under its own heading with a one-line explanation:

- **"Map settings"**, explained as "Shared with everyone on this map": minimal font size, maximal font size and font size step.
- **"User settings"**, explained as "Only for you, in this browser": center on resizing, automatic branch colors, branch style, show linktext, root node name and node name.

No option SHALL appear in both groups. The map settings group SHALL come first.

#### Scenario: Headings are visible

- **WHEN** the user opens the Mind map tab
- **THEN** the headings "Map settings" and "User settings" SHALL be displayed, each with its explanation

#### Scenario: Font sizes are map settings

- **WHEN** the user opens the Mind map tab
- **THEN** the font size inputs SHALL be displayed under "Map settings"

#### Scenario: Branch style is a user setting

- **WHEN** the user opens the Mind map tab
- **THEN** the branch style select SHALL be displayed under "User settings"

#### Scenario: Read-only viewer

- **WHEN** a user without write access opens the Mind map tab
- **THEN** the inputs under "Map settings" SHALL be disabled
- **AND** the inputs under "User settings" SHALL be enabled

### Requirement: User settings with a shared effect explain it

Two kinds of user settings are chosen per user but write values onto the nodes that user creates, so everyone on the map sees the result: automatic branch colors, and the root node name and node name defaults. They stay in the "User settings" group, and each SHALL show a visible hint:

- Below the automatic branch colors toggle: "Picks a color for each new branch you create. The color is saved on the node, so everyone on this map sees it." The toggle's tooltip SHALL show the same text.
- Below the Nodes section: "Used as the name of maps and nodes you create. The name is saved on the node, so everyone on this map sees it."

#### Scenario: Hints are visible

- **WHEN** the user opens the Mind map tab
- **THEN** both hints SHALL be displayed without hovering

#### Scenario: Tooltip matches the hint

- **WHEN** the user hovers the automatic branch colors toggle
- **THEN** the tooltip SHALL show the same text as its hint

### Requirement: Branch style option

The "User settings" group SHALL provide a "Branch style" select in a "Branches" section with the options "Tapered", "Curved" and "Straight". It SHALL show the user's current style and save a new choice to the user settings.

#### Scenario: Select a branch style

- **WHEN** the user opens the Mind map tab and selects "Curved"
- **THEN** the map behind the dialog SHALL redraw with curved branches at once
