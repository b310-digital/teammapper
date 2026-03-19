## ADDED Requirements

### Requirement: Import menu offers JSON and Mermaid options
The system SHALL provide an import menu that displays JSON and Mermaid import options when opened.

#### Scenario: Open import menu
- **WHEN** the user opens the import menu
- **THEN** both "JSON" and "MERMAID" options SHALL be visible

### Requirement: User can import a mind map from a JSON file
The system SHALL allow users to import a mind map by uploading a JSON file. The imported map SHALL replace the current map and display the nodes defined in the file.

#### Scenario: Upload JSON file for import
- **WHEN** the user selects JSON import and uploads a valid JSON map file
- **THEN** the imported nodes SHALL be visible on the map
- **AND** each expected node SHALL appear exactly once

### Requirement: User can import a mind map from Mermaid syntax
The system SHALL open a dialog with a text area when the user selects the Mermaid import option. Users SHALL enter Mermaid mindmap syntax and trigger import. On success, the dialog SHALL close and the nodes from the Mermaid syntax SHALL appear on the map.

#### Scenario: Import Mermaid mindmap via dialog
- **WHEN** the user enters valid Mermaid mindmap syntax and clicks import
- **THEN** the dialog SHALL close
- **AND** all nodes defined in the Mermaid syntax SHALL be visible on the map

### Requirement: Mermaid import preserves branch color assignment
The system SHALL assign distinct branch colors when importing a Mermaid mindmap with multiple first-level branches. Child branches SHALL share their parent's color, resulting in as many unique colors as there are first-level branches.

#### Scenario: Imported Mermaid map has correct branch colors
- **WHEN** a Mermaid mindmap with 3 first-level branches (one with a child) is imported
- **THEN** 4 branch connectors SHALL exist
- **AND** there SHALL be exactly 3 unique colors among them

### Requirement: Export keyboard shortcut
The system SHALL trigger the export action when the user presses ctrl+e.

#### Scenario: Export via keyboard shortcut
- **WHEN** the user presses ctrl+e in the map editor
- **THEN** the export action SHALL be triggered

### Requirement: Export image and document formats
The system SHALL allow exporting mind maps as SVG, PNG, JPG images and PDF documents via the export dropdown menu.

#### Scenario: Export SVG
- **WHEN** the user clicks "Image (.svg)" in the export menu
- **THEN** the map SHALL be downloaded as an SVG image file

#### Scenario: Export PNG
- **WHEN** the user clicks "Image (.png)" in the export menu
- **THEN** the map SHALL be downloaded as a PNG image file

#### Scenario: Export JPG
- **WHEN** the user clicks "Image (.jpg)" in the export menu
- **THEN** the map SHALL be downloaded as a JPG image file

#### Scenario: Export PDF
- **WHEN** the user clicks "Document (.pdf)" in the export menu
- **THEN** the map SHALL be downloaded as a PDF document
