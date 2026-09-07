## MODIFIED Requirements

### Requirement: User can import a mind map from Mermaid syntax
The system SHALL open a dialog with a text area when the user selects the Mermaid import option. Users SHALL enter Mermaid mindmap syntax and trigger import. On success, the dialog SHALL close and the nodes from the Mermaid syntax SHALL appear on the map. The dialog SHALL NOT include any AI generation functionality.

#### Scenario: Import Mermaid mindmap via dialog
- **WHEN** the user enters valid Mermaid mindmap syntax and clicks import
- **THEN** the dialog SHALL close
- **AND** all nodes defined in the Mermaid syntax SHALL be visible on the map

#### Scenario: Mermaid import dialog has no AI generation section
- **WHEN** the user opens the Mermaid import dialog
- **THEN** the dialog SHALL NOT display any AI description input field
- **AND** the dialog SHALL NOT display any AI generation button

## REMOVED Requirements

### Requirement: Mermaid import dialog SHALL reflect AI-generated content immediately
**Reason**: AI generation has been removed from the mermaid import dialog. The dedicated AI import dialog handles this workflow.
**Migration**: Use the dedicated AI import dialog accessible from the toolbar's import menu.
