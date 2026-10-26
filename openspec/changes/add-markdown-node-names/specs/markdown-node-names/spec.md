## ADDED Requirements

### Requirement: Every node name is markdown

Every node name SHALL hold markdown source and SHALL render with the markdown subset below. The name SHALL never hold HTML and SHALL NOT be HTML-escaped, so `Tom & Jerry` is stored as `Tom & Jerry`.

#### Scenario: Name stores its source

- **WHEN** a user formats `Total` in bold inside the name `Total net`
- **THEN** the node name SHALL be stored as `**Total** net`

#### Scenario: Ampersand and angle brackets stay literal

- **WHEN** a user names a node `a < b & c`
- **THEN** the node name SHALL be stored as `a < b & c`
- **AND** the node SHALL show `a < b & c`

### Requirement: Names support the Mermaid markdown subset

A name SHALL render:

- `**x**` and `__x__` in bold
- `*x*` and `_x_` in italic
- either one nested in the other
- a newline as a line break

A backslash SHALL escape `\`, `*` and `_`. Emphasis SHALL follow the CommonMark delimiter rules, so an underscore inside a word and an asterisk surrounded by spaces are plain text.

Every other construct, including links, images, headings, lists, code spans and HTML, SHALL render as its literal source text. The rendered name SHALL contain no element other than `strong`, `em` and `br`.

#### Scenario: Bold and italic parts

- **WHEN** a node is named `**Total** and *net*`
- **THEN** the node SHALL show `Total` in bold, `and` in normal style and `net` in italic

#### Scenario: Nested emphasis

- **WHEN** a node is named `**very *important***`
- **THEN** `very ` SHALL show in bold and `important` in bold italic

#### Scenario: Line break

- **WHEN** a node name holds a newline between `first` and `second`
- **THEN** the node SHALL show `first` and `second` on two lines

#### Scenario: Escaped marker

- **WHEN** a node is named `2 \* 3`
- **THEN** the node SHALL show `2 * 3` with no italic part

#### Scenario: Plain asterisks and underscores

- **WHEN** nodes are named `5 * 3 * 2` and `snake_case_name`
- **THEN** both SHALL show as written, with no italic part

#### Scenario: Link and image stay text

- **WHEN** a node is named `[site](https://example.com) ![x](a.png)`
- **THEN** the node SHALL show that source text literally
- **AND** it SHALL contain no anchor and no image element

#### Scenario: HTML stays text

- **WHEN** a name arriving through sync or import holds `<img src=x onerror=alert(1)>`
- **THEN** the node SHALL show that text literally and contain no image element

### Requirement: Editing a name is WYSIWYG

When the user edits a name, the editable element SHALL show the rendered formatting and SHALL NOT show markdown markers. The user never types markdown, so characters the user types or pastes SHALL stay literal, and ending the edit SHALL store typed `\`, `*` and `_` escaped.

- Ctrl+B (Cmd+B on macOS) SHALL toggle bold on the selection, and Ctrl+I (Cmd+I) SHALL toggle italic.
- Shift+Enter SHALL insert a line break.
- Pasting SHALL insert plain text.
- Ending the edit SHALL convert the edited content to markdown source and store it.

#### Scenario: Edit keeps the formatting visible

- **GIVEN** a node named `**Total** net`
- **WHEN** the user starts editing it
- **THEN** the element SHALL show `Total` in bold and `net` in normal style
- **AND** it SHALL show no asterisks

#### Scenario: Bold a selected word

- **GIVEN** the user edits a node named `Total net`
- **WHEN** the user selects `Total`, presses Ctrl+B and ends the edit
- **THEN** the name SHALL be stored as `**Total** net`

#### Scenario: Typed markers stay literal

- **WHEN** the user types `**x**` into a name and ends the edit
- **THEN** the name SHALL be stored as `\*\*x\*\*`
- **AND** the node SHALL show `**x**` with no bold part

#### Scenario: Line break while editing

- **WHEN** the user presses Shift+Enter while editing a name
- **THEN** the edit SHALL continue with the caret on a new line
- **AND** the stored source SHALL hold a newline at that position

### Requirement: Inline formatting combines with whole-node bold and italic

The node attributes `font.weight` and `font.style` SHALL keep applying to the whole name as the default for every run. Inline bold and italic SHALL add to that default. A run marked bold inside a node whose `font.weight` is `bold` SHALL stay bold.

#### Scenario: Inline bold inside an italic node

- **GIVEN** a node has `font.style` set to `italic`
- **WHEN** its name is `**Total** net`
- **THEN** `Total` SHALL show in bold italic and `net` in italic

#### Scenario: Whole-node bold without markers

- **GIVEN** a node has `font.weight` set to `bold`
- **WHEN** its name is `Total`
- **THEN** `Total` SHALL show in bold

### Requirement: Existing names migrate to markdown source

A database migration SHALL convert every stored node name from today's HTML-escaped text:

1. It SHALL decode HTML entities.
2. It SHALL turn `<br>` into a newline.
3. It SHALL strip any other tag.

The migration SHALL leave asterisks, underscores and backslashes unchanged, so a stored `*x*` renders in italic after the migration.

#### Scenario: Entities and line breaks

- **WHEN** the migration converts `Tom &amp; Jerry` and `first<br>second`
- **THEN** the stored names SHALL be `Tom & Jerry`, and `first` and `second` separated by a newline

#### Scenario: Plain name

- **WHEN** the migration converts `Plan 2027`
- **THEN** the stored name SHALL stay `Plan 2027`

### Requirement: Plain-text readers show names without markers

Every place that shows a name outside the map SHALL show the name's plain text: the map title in the list of recent mind maps, the share dialog and the export file name.

#### Scenario: Map title

- **WHEN** the root node's name is `**Plan** 2027`
- **THEN** the list of recent mind maps SHALL show `Plan 2027`
