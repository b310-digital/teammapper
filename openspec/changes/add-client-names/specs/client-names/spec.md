## ADDED Requirements

### Requirement: A browser keeps one optional display name

The system SHALL let a user set a display name, stored as `displayName` in the general user settings of the browser. Every client of that browser SHALL use the same display name on every map. An empty display name SHALL mean the user has no display name. The server SHALL NOT store the display name.

#### Scenario: Name applies to every map

- **GIVEN** the user has set the display name "Anna Schmidt"
- **WHEN** the user opens a second map in the same browser
- **THEN** the client on that map SHALL announce the display name "Anna Schmidt"

#### Scenario: Name survives a reload

- **GIVEN** the user has set a display name
- **WHEN** the user reloads the page
- **THEN** the display name SHALL be unchanged

#### Scenario: Stored settings from an older version

- **GIVEN** the stored user settings hold no `displayName`
- **WHEN** the app starts
- **THEN** the display name SHALL be empty
- **AND** every other stored setting SHALL be kept

### Requirement: Display names are normalized

The system SHALL normalize a display name before it saves it and after it receives one from another client. Normalizing SHALL turn a value that is not a string into the empty string, remove control and format characters, collapse every run of whitespace to one space, trim, and cut the result to 30 graphemes. The system SHALL render a display name as text only.

#### Scenario: Whitespace is collapsed

- **WHEN** the user saves the display name `"  Anna   Schmidt "`
- **THEN** the stored display name SHALL be "Anna Schmidt"

#### Scenario: Long name is cut

- **WHEN** the user saves a display name of 40 characters
- **THEN** the stored display name SHALL hold its first 30 graphemes

#### Scenario: Blank name clears it

- **WHEN** the user saves a display name holding only spaces
- **THEN** the display name SHALL be empty

#### Scenario: Remote client sends a malformed name

- **WHEN** a remote client announces a display name that is a number, or a string of 1000 characters
- **THEN** the local client SHALL treat the number as no display name
- **AND** SHALL show at most the first 30 graphemes of the string

#### Scenario: Remote client sends markup

- **WHEN** a remote client announces the display name `<img src=x onerror=alert(1)>`
- **THEN** the local client SHALL show it as literal text
- **AND** SHALL run no script

### Requirement: User edits the display name from the own client icon

The own client's entry in the client list SHALL be a button. Activating it SHALL open a dialog with one text field holding the current display name, a "Save" and a "Cancel" button. "Save" SHALL store the normalized value and close the dialog. "Cancel" and Escape SHALL close the dialog and change nothing. The dialog SHALL be available in maps the client may only read.

#### Scenario: Set a name from the client list

- **GIVEN** the user has no display name
- **WHEN** the user clicks the own client icon, types "Anna Schmidt" and saves
- **THEN** the display name SHALL be "Anna Schmidt"
- **AND** the own client icon SHALL show "AS"

#### Scenario: Cancel keeps the name

- **GIVEN** the display name is "Anna Schmidt"
- **WHEN** the user opens the dialog, types "Bob" and cancels
- **THEN** the display name SHALL be "Anna Schmidt"

#### Scenario: Read-only map

- **WHEN** the user opens a map through a view link and clicks the own client icon
- **THEN** the dialog SHALL open and saving SHALL change the display name

#### Scenario: Other client icons are not buttons

- **WHEN** the user clicks the icon of another client
- **THEN** no dialog SHALL open

### Requirement: The client list shows initials

Each entry of the client list SHALL show the initials of the client's display name in a circle filled with the client color. The initials SHALL be the upper-cased first grapheme of the first word and, when the name has two or more words, of the last word. The initials SHALL use black or white, whichever contrasts more with the client color. An entry without a display name SHALL show the generic client icon in its client color, as today. Each entry SHALL carry the full display name as its accessible label, or "Anonymous" without one.

#### Scenario: Two-word name

- **WHEN** a client with the display name "Anna Maria Schmidt" is on the map
- **THEN** its entry SHALL show "AS"

#### Scenario: One-word name

- **WHEN** a client with the display name "anna" is on the map
- **THEN** its entry SHALL show "A"

#### Scenario: Name starting with an emoji

- **WHEN** a client with the display name "🦊 Fox" is on the map
- **THEN** its entry SHALL show "🦊F"

#### Scenario: Anonymous client

- **WHEN** a client without a display name is on the map
- **THEN** its entry SHALL show the generic client icon in its client color
- **AND** its accessible label SHALL be the translated "Anonymous"

#### Scenario: Readable initials on every palette color

- **WHEN** a client's color is any color of the client color palette
- **THEN** the contrast ratio between the initials and the circle SHALL be at least 4.5:1
