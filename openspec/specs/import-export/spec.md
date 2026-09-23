# import-export Specification

## Purpose

Lets users bring mind maps in from JSON and Mermaid files, and take them out as JSON, Mermaid, SVG, PNG, JPG and PDF files.

## Requirements

### Requirement: Import menu offers JSON, Mermaid, and AI options
The system SHALL provide an import menu that displays JSON and Mermaid import options when opened. When the AI feature is enabled, an AI generation option SHALL also be visible.

#### Scenario: Open import menu
- **WHEN** the user opens the import menu
- **THEN** both "JSON" and "MERMAID" options SHALL be visible

#### Scenario: AI enabled shows AI import option
- **WHEN** the user opens the import menu
- **AND** the AI feature flag is enabled
- **THEN** an "AI" import option SHALL be visible alongside JSON and Mermaid options

#### Scenario: AI disabled hides AI import option
- **WHEN** the user opens the import menu
- **AND** the AI feature flag is disabled
- **THEN** only JSON and Mermaid import options SHALL be visible

### Requirement: User can import a mind map from a JSON file
The system SHALL allow users to import a mind map by uploading a JSON file. The imported map SHALL replace the current map and display the nodes defined in the file.

#### Scenario: Upload JSON file for import
- **WHEN** the user selects JSON import and uploads a valid JSON map file
- **THEN** the imported nodes SHALL be visible on the map
- **AND** each expected node SHALL appear exactly once

### Requirement: User can import a mind map from Mermaid syntax
The system SHALL open a dialog with a text area when the user selects the Mermaid import option. Users SHALL enter Mermaid mindmap syntax and trigger import. The import SHALL replace the current map. A document holding several `mindmap` blocks SHALL import as one tree per block, and only the root of the first block SHALL carry the main-root mark. On success, the dialog SHALL close and the nodes from the Mermaid syntax SHALL appear on the map. The dialog SHALL NOT include any AI generation functionality.

#### Scenario: Import Mermaid mindmap via dialog
- **WHEN** the user enters valid Mermaid mindmap syntax and clicks import
- **THEN** the dialog SHALL close
- **AND** all nodes defined in the Mermaid syntax SHALL be visible on the map

#### Scenario: Import a document with two mindmap blocks
- **WHEN** the user enters two `mindmap` blocks and clicks import
- **THEN** the map SHALL hold two trees and no node from before the import
- **AND** the root of the first block SHALL carry the main-root mark
- **AND** the root of the second block SHALL NOT carry the main-root mark
- **AND** the second tree SHALL be placed clear of the first

#### Scenario: Mermaid import dialog has no AI generation section
- **WHEN** the user opens the Mermaid import dialog
- **THEN** the dialog SHALL NOT display any AI description input field
- **AND** the dialog SHALL NOT display any AI generation button

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

### Requirement: Mermaid export writes one block per tree
The system SHALL export a map as one `mindmap` block per tree, since the Mermaid format allows a single root per block. The block for the main root SHALL come first, and a blank line SHALL separate consecutive blocks. The export SHALL include every node that a root reaches.

#### Scenario: Export a two-tree map
- **WHEN** the user exports a map holding two trees
- **THEN** the output SHALL contain two `mindmap` blocks
- **AND** the first block SHALL start with the main root
- **AND** each block SHALL contain the descendants of its own root

#### Scenario: Export a single-node tree
- **WHEN** a map holds a root with no children alongside the main tree
- **THEN** the output SHALL contain a `mindmap` block holding that root alone

#### Scenario: Round-trip a multi-tree map
- **WHEN** the user exports a map with three trees and imports the result
- **THEN** the map SHALL hold three trees with the same nodes
- **AND** the root of the first block SHALL carry the main-root mark
