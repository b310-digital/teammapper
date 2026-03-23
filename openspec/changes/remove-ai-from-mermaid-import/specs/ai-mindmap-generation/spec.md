## MODIFIED Requirements

### Requirement: AI generation dialog SHALL reflect generation state immediately

The AI generation dialog SHALL update its visible state immediately when async operations complete, without requiring additional user interaction. This applies to the standalone AI import dialog only.

#### Scenario: AI generation loading state updates immediately
- **WHEN** the user triggers AI generation in the standalone AI import dialog
- **THEN** the generate button SHALL be disabled immediately when generation starts
- **AND** the button SHALL be re-enabled immediately when generation completes or fails

#### Scenario: Pictogram search results appear immediately
- **WHEN** the user searches for pictograms in the pictogram dialog
- **AND** the ARASAAC API returns results
- **THEN** the pictogram grid SHALL display results immediately without the user needing to click or interact with any other element

## REMOVED Requirements

### Requirement: AI generation result appears immediately in mermaid dialog
**Reason**: AI generation has been removed from the mermaid import dialog. The mermaid dialog no longer has an AI section.
**Migration**: Use the dedicated AI import dialog, which generates and imports in one step.
