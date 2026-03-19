## ADDED Requirements

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
