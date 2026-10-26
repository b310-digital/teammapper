## Why

Bold and italic apply only to a whole node name, so a single word cannot stand out. Mermaid mindmaps use markdown strings (``"`**bold** and *italic*`"``) for this. TeamMapper's Mermaid import cannot read them, and its export cannot write them. Styling inside the name lets people format parts of it and keeps Mermaid import and export lossless.

## What Changes

- **Every name is markdown**: a node name holds markdown source and renders the subset Mermaid markdown strings support: bold, italic and line breaks. Every other markdown construct shows as its literal source text, links and images included.
- **WYSIWYG editing**: the user sees the formatting and never the markers. Ctrl+B and Ctrl+I toggle bold and italic on the selection. Typed asterisks and underscores stay literal.
- **Toolbar**:
  - While a name is being edited, the bold and italic buttons format the selection and keep the editor open.
  - Otherwise they toggle the whole node's `font.weight` and `font.style`, as today.
- **Whole-node bold and italic stay**: they act as the default for every run of the name, and inline formatting adds to them. Moving them into markers is a later step.
- **Migration**: one migration converts stored names from today's HTML-escaped text to plain source. It decodes entities and turns `<br>` into a newline. Persistence stops HTML-escaping names.
- **Mermaid**:
  - Import reads markdown strings.
  - Export writes formatted names, and names with whole-node bold or italic, as markdown strings.
- **Image exports** keep bold and italic parts.
- **JSON import** converts names from exports made before the change.

## Non-goals

- Links, images, headings, lists, code, tables, strikethrough or HTML inside a name.
- Colors or font size in markdown. The node-wide font size and colors stay as they are.
- Removing or migrating `font.weight` and `font.style`.
- Typing markdown by hand, or rich paste.
- Mermaid features beyond markdown strings, such as node shapes, icons or classes.
- Changes to the AI prompt.

## Capabilities

### New Capabilities

- `markdown-node-names`:
  - the markdown subset
  - rendering
  - WYSIWYG editing
  - the combination with whole-node bold and italic
  - the name migration
  - plain-text readers

### Modified Capabilities

- `node-operations`: the bold and italic buttons format the selection while a name is being edited
- `import-export`: Mermaid import and export of markdown strings, JSON import of older exports, and image export of formatted parts
- `input-sanitization`: names are stored without HTML escaping and never rendered as HTML

## Impact

- **Shared**: `escapeMarkdown` and `decodeLegacyName` in `packages/shared`. The frontend uses them for imports, and the backend uses them for persistence.
- **mmp**: the markdown parser and `markdownToPlainText`, which `packages/mmp` exports for the frontend's plain-text readers.
- **Storage**: a migration rewrites `mmp_node.name`. No schema change.
- **Backend**: `sanitizeName` keeps stripping tags but stops escaping entities.
- **Renderer**: `packages/mmp` renders runs, edits WYSIWYG, converts the editor content to source, and keeps the formatting in image export.
- **Frontend**:
  - Mermaid import, with a flag from `packages/mermaid-mindmap-parser`.
  - Mermaid export.
  - JSON import.
  - The toolbar.
  - Plain-text readers.
- **Glossary**: an entry for **Inline formatting**.
