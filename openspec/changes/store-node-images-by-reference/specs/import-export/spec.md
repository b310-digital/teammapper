## ADDED Requirements

### Requirement: Exports contain node images inline
Every export SHALL embed node images as data URLs, whether a node holds a data URL or a reference, so that the exported file shows its images without access to the server. This SHALL apply to SVG, PNG, JPG, PDF and JSON exports. When a referenced image cannot be fetched, the export SHALL omit that node's image and SHALL still complete.

#### Scenario: Export with a missing image
- **GIVEN** a node whose reference the image endpoint answers with not found
- **WHEN** the user exports the map as JSON
- **THEN** that node SHALL have no image in the file
- **AND** the file SHALL contain no `image:` reference

#### Scenario: JSON export of a map with references
- **WHEN** the user exports a map whose nodes reference images as JSON
- **THEN** each node image in the file SHALL be a data URL of the referenced image
- **AND** the file SHALL contain no `image:` reference

#### Scenario: SVG export of a map with references
- **WHEN** the user exports a map whose nodes reference images as SVG
- **THEN** every image element in the file SHALL carry a data URL

#### Scenario: PNG export of a map with references
- **WHEN** the user exports a map whose nodes reference images as PNG
- **THEN** the exported picture SHALL show every node image

### Requirement: JSON import accepts inline node images
A JSON import SHALL accept node images given as data URLs and SHALL keep them as data URLs. The imported nodes SHALL display their images.

#### Scenario: Round-trip a map with images
- **WHEN** the user exports a map with images as JSON and imports the file into another map
- **THEN** every imported node SHALL display its image
- **AND** every imported node image SHALL be a data URL
