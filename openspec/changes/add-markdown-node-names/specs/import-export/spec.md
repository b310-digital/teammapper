## ADDED Requirements

### Requirement: Mermaid import reads markdown strings

The Mermaid import SHALL give every node the format `markdown`. A node written as a markdown string (``"`...`"``) SHALL keep its content as the source. Any other description SHALL be stored with `\`, `*` and `_` escaped, so it shows as written. The import SHALL decode `#quot;` to `"` and `#96;` to a backtick inside markdown strings.

#### Scenario: Import a markdown string

- **WHEN** the user imports a node written as ``a["`**Total** *net*`"]``
- **THEN** the node SHALL be named `**Total** *net*` with the format `markdown`
- **AND** it SHALL show `Total` in bold and `net` in italic

#### Scenario: Import a plain description

- **WHEN** the user imports a node written as `a[2 * 3]`
- **THEN** the node SHALL be named `2 \* 3` with the format `markdown`
- **AND** it SHALL show `2 * 3`

### Requirement: Mermaid export writes markdown strings

The Mermaid export SHALL write a markdown node as a markdown string holding its source, with `"` written as `#quot;` and a backtick as `#96;`. A text node whose deprecated `font.weight` is `bold` or `font.style` is `italic` SHALL be written as the markdown string of its escaped name wrapped in the matching markers. Any other text node SHALL be written as before. A node with a link SHALL keep the form `[name](href)`, with a markdown name reduced to its plain text.

#### Scenario: Round-trip a markdown name

- **WHEN** the user exports a map holding a markdown node named `**Total**` followed by a newline and `*net*`, and imports the result
- **THEN** the node SHALL have the same name and the format `markdown`

#### Scenario: Export a legacy bold name

- **GIVEN** a text node named `Total` has `font.weight` set to `bold`
- **WHEN** the user exports the map to Mermaid
- **THEN** the node SHALL be written as the markdown string ``"`**Total**`"``

#### Scenario: Export quotes and backticks

- **GIVEN** a markdown node is named ``say "hi" `now` ``
- **WHEN** the user exports and imports the map
- **THEN** the node SHALL have the same name

### Requirement: Image export keeps markdown formatting

SVG, PNG, JPG and PDF exports SHALL show the bold and italic parts and the line breaks of every markdown name as the map shows them.

#### Scenario: Export a formatted name as SVG

- **GIVEN** a markdown node is named `**Total** net`
- **WHEN** the user exports the map as SVG
- **THEN** the SVG SHALL draw `Total` with `font-weight` bold and `net` with normal weight
