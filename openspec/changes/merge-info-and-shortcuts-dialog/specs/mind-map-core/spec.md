## MODIFIED Requirements

### Requirement: Map Info and Deletion

The system SHALL display map metadata, every keyboard shortcut and the map deletion action in one info dialog. The dialog SHALL open over the map without changing the URL or reloading the map.

#### Scenario: Info dialog

- **WHEN** the user clicks the info button in the map editor
- **THEN** a dialog titled "TeamMapper {version}" SHALL be displayed showing the app description, deletion policy, deletion date, GitHub link, and a "Delete mindmap" button
- **AND** below that information the dialog SHALL list every keyboard shortcut with its keys and description

#### Scenario: Deletion policy

- **WHEN** the info dialog is displayed
- **THEN** the text "Mindmaps will be deleted on this server after 30 days" SHALL be shown along with the specific deletion date

#### Scenario: Map stays in place

- **GIVEN** a map with a selected node
- **WHEN** the user opens and then closes the info dialog
- **THEN** the URL SHALL be unchanged
- **AND** the same node SHALL still be selected

#### Scenario: Small screen

- **WHEN** the info dialog is open on a phone-sized screen
- **THEN** the shortcut list SHALL show one column
- **AND** the dialog content SHALL scroll with its actions reachable

## ADDED Requirements

### Requirement: Shortcut opens the info dialog

The system SHALL open the info dialog when the user presses `?` in the map editor. The system SHALL show at most one info dialog at a time.

#### Scenario: Open with the shortcut

- **WHEN** the user presses `?` in the map editor
- **THEN** the info dialog SHALL open showing the shortcut list

#### Scenario: No second dialog

- **GIVEN** the info dialog is open
- **WHEN** the user presses `?` or clicks the info button
- **THEN** exactly one info dialog SHALL be open

### Requirement: Map shortcuts rest while the info dialog is open

While the info dialog is open, no map shortcut SHALL act on the map. Escape SHALL close the dialog, and map shortcuts SHALL work again once it is closed.

#### Scenario: Shortcut inside the dialog

- **GIVEN** a map with a selected node and the info dialog open
- **WHEN** the user presses the add node shortcut
- **THEN** the map SHALL hold the same nodes as before

#### Scenario: Close with Escape

- **GIVEN** the info dialog is open
- **WHEN** the user presses Escape
- **THEN** the dialog SHALL close
- **AND** the add node shortcut SHALL add a node again
