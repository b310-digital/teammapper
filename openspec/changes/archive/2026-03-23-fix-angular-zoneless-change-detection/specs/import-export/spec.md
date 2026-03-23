## ADDED Requirements

### Requirement: Mermaid import dialog SHALL reflect AI-generated content immediately

When AI generation populates the mermaid text area, the content SHALL be visible to the user immediately upon generation completing, without requiring any additional user interaction such as clicking or tabbing.

#### Scenario: AI-generated mermaid content visible without interaction
- **WHEN** the user enters a description and clicks the AI generation button in the mermaid import dialog
- **AND** the server returns generated mermaid syntax
- **THEN** the mermaid text area SHALL display the generated content immediately
- **AND** the user SHALL be able to click "Import" without any additional interaction to reveal the content
