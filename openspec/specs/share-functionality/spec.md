## ADDED Requirements

### Requirement: Share dialog displays map sharing options
The system SHALL open a share dialog when the user triggers the share action. The dialog SHALL contain a title, a QR code, a share link containing the map URL, a copy button, a download button, a duplicate button, and an editable/view-only toggle.

#### Scenario: Open share dialog and verify contents
- **WHEN** the user opens the share dialog
- **THEN** the dialog SHALL display a title, a QR code, a link input containing the map URL, copy/download/duplicate buttons, and an editable/view-only toggle

### Requirement: Copy button copies the share link to clipboard
The system SHALL copy the share link to the clipboard when the user clicks the copy button in the share dialog.

#### Scenario: Copy link to clipboard
- **WHEN** the user clicks the copy button
- **THEN** the clipboard content SHALL match the share link value

### Requirement: Share dialog can be closed
The system SHALL close the share dialog when the user clicks the close button.

#### Scenario: Close the share dialog
- **WHEN** the user clicks "Close"
- **THEN** the share dialog SHALL no longer be visible
