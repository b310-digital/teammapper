## ADDED Requirements

### Requirement: Mermaid import reads markdown strings

A node written as a Mermaid markdown string (``"`...`"``) SHALL keep its content as the name's source. Any other description SHALL be stored with `\`, `*` and `_` escaped, so it shows as written. The import SHALL decode `#quot;` to `"` and `#96;` to a backtick inside markdown strings.

#### Scenario: Import a markdown string

- **WHEN** the user imports a node written as ``a["`**Total** *net*`"]``
- **THEN** the node SHALL be named `**Total** *net*`
- **AND** it SHALL show `Total` in bold and `net` in italic

#### Scenario: Import a plain description

- **WHEN** the user imports a node written as `a[2 * 3]`
- **THEN** the node SHALL be named `2 \* 3`
- **AND** it SHALL show `2 * 3`

### Requirement: Mermaid export writes markdown strings

The Mermaid export SHALL write a name that holds markdown formatting or an escape as a markdown string holding its source, with `"` written as `#quot;` and a backtick as `#96;`. A node whose `font.weight` is `bold` or whose `font.style` is `italic` SHALL be written as a markdown string with its source wrapped in the matching markers. Any other name SHALL be written as before. A node with a link SHALL keep the form `[name](href)`, with the name reduced to its plain text.

#### Scenario: Round-trip a formatted name

- **WHEN** the user exports a map holding a node named `**Total**`, a newline and `*net*`, and imports the result
- **THEN** the node SHALL have the same name

#### Scenario: Export a whole-node bold name

- **GIVEN** a node named `Total` has `font.weight` set to `bold`
- **WHEN** the user exports the map to Mermaid
- **THEN** the node SHALL be written as the markdown string ``"`**Total**`"``

#### Scenario: Export quotes and backticks

- **GIVEN** a node is named ``say "hi" `now` **ok**``
- **WHEN** the user exports and imports the map
- **THEN** the node SHALL have the same name

### Requirement: JSON import reads names exported before markdown names

A JSON import SHALL convert a name that holds an HTML entity (`&amp;`, `&lt;`, `&gt;`, `&quot;` or `&#39;`) or a `<br>` the way the database migration does. Any other name SHALL be imported unchanged.

#### Scenario: Old export with an entity

- **WHEN** the user imports a JSON file holding a node named `Tom &amp; Jerry`
- **THEN** the node SHALL be named `Tom & Jerry`

### Requirement: Image export keeps markdown formatting

SVG, PNG, JPG and PDF exports SHALL show the bold and italic parts and the line breaks of every name as the map shows them.

#### Scenario: Export a formatted name as SVG

- **GIVEN** a node is named `**Total** net`
- **WHEN** the user exports the map as SVG
- **THEN** the SVG SHALL draw `Total` with `font-weight` bold and `net` in the node's own weight
