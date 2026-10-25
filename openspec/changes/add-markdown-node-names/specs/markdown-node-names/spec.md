## ADDED Requirements

### Requirement: A node name has a format

Each node SHALL have a name format, `text` or `markdown`, stored in the attribute `nameFormat`. A node without the attribute SHALL have the format `text`. A **text name** SHALL render as it did before markdown names existed. A **markdown name** SHALL render its source with the markdown subset below. The name SHALL always hold the source string, never HTML.

#### Scenario: Existing node without the attribute

- **GIVEN** a map saved before markdown names existed holds a node named `a *b* c`
- **WHEN** a client opens the map
- **THEN** the node SHALL show `a *b* c` with its asterisks and no italic part

#### Scenario: Markdown node stores its source

- **WHEN** a user names a markdown node `**Total** net`
- **THEN** the node name SHALL be stored as `**Total** net`

### Requirement: Markdown names support the Mermaid subset

A markdown name SHALL render `**x**` and `__x__` in bold, `*x*` and `_x_` in italic, either nested in the other, and a newline as a line break. A backslash SHALL escape `\`, `*` and `_`. Emphasis SHALL follow the CommonMark delimiter rules, so an underscore inside a word is plain text. Every other construct, including links, images, headings, lists, code spans and HTML, SHALL render as its literal source text. The rendered name SHALL contain no element other than `strong`, `em` and `br`.

#### Scenario: Bold and italic parts

- **WHEN** a markdown node is named `**Total** and *net*`
- **THEN** the node SHALL show `Total` in bold, `and` in normal style and `net` in italic

#### Scenario: Nested emphasis

- **WHEN** a markdown node is named `**very *important***`
- **THEN** `very ` SHALL show in bold and `important` in bold italic

#### Scenario: Line break

- **WHEN** a markdown node name holds a newline between `first` and `second`
- **THEN** the node SHALL show `first` and `second` on two lines

#### Scenario: Escaped marker

- **WHEN** a markdown node is named `2 \* 3`
- **THEN** the node SHALL show `2 * 3` with no italic part

#### Scenario: Underscore inside a word

- **WHEN** a markdown node is named `snake_case_name`
- **THEN** the node SHALL show `snake_case_name` with no italic part

#### Scenario: Link and image stay text

- **WHEN** a markdown node is named `[site](https://example.com) ![x](a.png)`
- **THEN** the node SHALL show that source text literally
- **AND** it SHALL contain no anchor and no image element

#### Scenario: HTML stays text

- **WHEN** a markdown name arriving through sync or import holds `<b>x</b>`
- **THEN** the node SHALL show `<b>x</b>` literally and no bold part

### Requirement: Editing a markdown name shows its source

When the user edits a markdown name, the editable element SHALL show the source. Shift+Enter SHALL insert a line break. Pasting SHALL insert plain text. Ending the edit SHALL store the source and render it again.

#### Scenario: Edit and render

- **GIVEN** a markdown node shows `Total` in bold
- **WHEN** the user starts editing it
- **THEN** the element SHALL show `**Total**`
- **AND** after the user ends the edit, it SHALL show `Total` in bold again

#### Scenario: Line break while editing

- **WHEN** the user presses Shift+Enter while editing a markdown name
- **THEN** the source SHALL hold a newline at the caret
- **AND** the edit SHALL continue

### Requirement: New nodes have markdown names

A current client SHALL give every node it creates the format `markdown`: a child, a tree, a Mermaid import and an AI generated map. A pasted node SHALL keep the format of the node it copies. A JSON import SHALL keep the format it finds and SHALL read a missing one as `text`.

#### Scenario: Add a child

- **WHEN** the user adds a child node
- **THEN** the child SHALL have the format `markdown`

#### Scenario: Paste a text node

- **GIVEN** the user copied a node with the format `text`
- **WHEN** the user pastes it
- **THEN** the pasted node SHALL have the format `text`

#### Scenario: JSON from an older export

- **WHEN** the user imports a JSON export whose nodes carry no `nameFormat`
- **THEN** every imported node SHALL have the format `text`

### Requirement: Node-wide bold and italic are deprecated

The attributes `font.weight` and `font.style` SHALL keep applying to text names. A markdown name SHALL ignore them, and no client SHALL write them for a markdown node.

#### Scenario: Legacy bold on a text name

- **GIVEN** a text node has `font.weight` set to `bold`
- **THEN** the whole name SHALL render in bold

#### Scenario: Legacy bold on a markdown name

- **GIVEN** a markdown node named `x` has `font.weight` set to `bold` from an older client
- **THEN** the name SHALL render in normal weight

### Requirement: User converts a text name to markdown

For a selected text node on a writable client, the toolbar SHALL show a button that converts the name to markdown. The conversion SHALL escape `\`, `*` and `_` in the name, wrap it in `**` when `font.weight` is `bold` and in `*` when `font.style` is `italic`, set both to `normal` and set the format to `markdown`, all in one undo step. The button SHALL be hidden for markdown nodes and on read-only clients. There SHALL be no conversion back to text.

#### Scenario: Convert a bold text name

- **GIVEN** a text node named `a*b` has `font.weight` set to `bold`
- **WHEN** the user converts it
- **THEN** the name SHALL be `**a\*b**` with the format `markdown`
- **AND** `font.weight` SHALL be `normal`
- **AND** the node SHALL still show `a*b` in bold

#### Scenario: Undo a conversion

- **WHEN** the user converts a text name and then undoes once
- **THEN** the node SHALL have its former name, font and the format `text`

#### Scenario: Markdown node or read-only client

- **GIVEN** the selected node has a markdown name, or the client is not writable
- **THEN** the convert button SHALL NOT be shown
