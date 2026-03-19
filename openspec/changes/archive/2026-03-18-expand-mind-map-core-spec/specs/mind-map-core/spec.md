## ADDED Requirements

### Requirement: Create new map from editor
The system SHALL allow users to create a new mind map from within the map editor via the "Cleans the map" button (note_add icon).

#### Scenario: Create from editor
- **WHEN** the user clicks the "Cleans the map" button in the map editor
- **THEN** the user SHALL be navigated to `/map` which creates a new map

### Requirement: Landing Page
The system SHALL display a landing page with a description of the application and a call-to-action to create a mind map.

#### Scenario: Hero section
- **WHEN** the home page loads
- **THEN** a hero section SHALL be displayed with the TeamMapper logo, tagline "The open-source web application to draw mind maps together", feature checklist, and a "Create mind map" button

#### Scenario: Feature cards
- **WHEN** the home page loads
- **THEN** three feature cards SHALL be displayed: "Colors and images", "Radial tree", and "Uses", each with an image and description

#### Scenario: Recently opened mindmaps
- **WHEN** the user has previously opened maps
- **THEN** a "Recently opened mindmaps" section SHALL show links to those maps with their root node name and last known deletion date

#### Scenario: Empty recent maps
- **WHEN** the user has not opened any maps
- **THEN** the "Recently opened mindmaps" section SHALL be displayed with no entries

### Requirement: Mind Map Canvas
The system SHALL render the mind map as an interactive SVG canvas with clickable nodes.

#### Scenario: Root node displayed
- **WHEN** a newly created map loads
- **THEN** a single "Root node" SHALL be displayed on the canvas

#### Scenario: Node selection
- **WHEN** the user clicks a node on the canvas
- **THEN** that node SHALL become selected and the toolbar buttons SHALL become enabled

#### Scenario: No selection state
- **WHEN** no node is selected
- **THEN** node-specific toolbar buttons (add, remove, copy, cut, paste, bold, italic, link, image, pictogram, detached node, group, hide children) SHALL be disabled

### Requirement: Map Info and Deletion
The system SHALL display map metadata and allow map deletion via an info dialog.

#### Scenario: Info dialog
- **WHEN** the user clicks the info button in the map editor
- **THEN** a dialog titled "TeamMapper {version}" SHALL be displayed showing the app description, deletion policy, deletion date, GitHub link, and a "Delete mindmap" button

#### Scenario: Deletion policy
- **WHEN** the info dialog is displayed
- **THEN** the text "Mindmaps will be deleted on this server after 30 days" SHALL be shown along with the specific deletion date

### Requirement: Internationalization
The system SHALL support multiple languages selectable from the footer or settings.

#### Scenario: Language selector
- **WHEN** the user opens the language selector
- **THEN** options SHALL be available for: English, French, German, Italian, Traditional Chinese, Simplified Chinese, Spanish, Portuguese Brazil

#### Scenario: Default language
- **WHEN** a fresh session loads
- **THEN** the language SHALL default to English
