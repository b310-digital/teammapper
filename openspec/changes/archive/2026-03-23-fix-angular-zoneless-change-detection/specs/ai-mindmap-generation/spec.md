## ADDED Requirements

### Requirement: AI generation dialog SHALL reflect generation state immediately

The AI generation dialogs SHALL update their visible state immediately when async operations complete, without requiring additional user interaction. This applies to both the standalone AI import dialog and the mermaid dialog's AI section.

#### Scenario: AI generation result appears immediately in mermaid dialog
- **WHEN** the user triggers AI generation in the mermaid import dialog
- **AND** the server returns a successful response
- **THEN** the generated mermaid syntax SHALL appear in the text area immediately without the user needing to click or interact with any other element

#### Scenario: AI generation loading state updates immediately
- **WHEN** the user triggers AI generation in the standalone AI import dialog
- **THEN** the generate button SHALL be disabled immediately when generation starts
- **AND** the button SHALL be re-enabled immediately when generation completes or fails

#### Scenario: Pictogram search results appear immediately
- **WHEN** the user searches for pictograms in the pictogram dialog
- **AND** the ARASAAC API returns results
- **THEN** the pictogram grid SHALL display results immediately without the user needing to click or interact with any other element
