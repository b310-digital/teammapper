## Why

Bold and italic apply only to a whole node name, so a single word cannot stand out. Mermaid mindmaps use markdown strings (``"`**bold** and *italic*`"``) for this, which TeamMapper's Mermaid import cannot read and its export cannot write. Styling inside the name lets people format parts of it and keeps Mermaid import and export lossless.

## What Changes

- **Markdown names**: a node gains the attribute `nameFormat`, either `text` or `markdown`. A markdown name renders the subset Mermaid markdown strings support: bold, italic and line breaks. Every other markdown construct, links and images included, shows as its literal source text.
- **New nodes are markdown**: every node a current client creates, pastes, imports or generates with AI carries `nameFormat: 'markdown'`.
- **Editing**: editing a markdown name shows its source. Leaving the edit renders it.
- **Legacy names**: a node without the attribute, or with `text`, renders exactly as today. The node-wide bold and italic attributes (`font.weight`, `font.style`) become deprecated: they keep working on text names, and no markdown node writes them.
- **Toolbar**: on a markdown node the bold and italic buttons wrap or unwrap the whole name in markdown markers. A new button converts a text name to markdown, escaping its markdown characters and turning the deprecated bold and italic into markers.
- **Mermaid**: import reads markdown strings into markdown names. Export writes markdown names, and text names styled with the deprecated attributes, as markdown strings. Image exports keep bold and italic parts.
- **Sync and storage**: the attribute syncs through the Y.Doc, a new `nameFormat` column stores it, and JSON export and import carry it.

## Non-goals

- Links, images, headings, lists, code, tables, strikethrough or HTML inside a name.
- Colors or font size in markdown. The node-wide font size and colors stay as they are and are not deprecated.
- Removing the deprecated attributes, or converting existing maps automatically.
- A rich text editor or live preview.
- Mermaid features beyond markdown strings, such as node shapes, icons or classes.
- Changes to the AI prompt.

## Capabilities

### New Capabilities

- `markdown-node-names`: the `nameFormat` attribute, the supported markdown subset, rendering, editing, conversion and the deprecated node-wide bold and italic

### Modified Capabilities

- `node-operations`: the bold and italic buttons act on the markdown of a markdown node
- `import-export`: Mermaid import and export of markdown strings, and image export of formatted parts
- `input-sanitization`: names stay free of markup, and `nameFormat` accepts two values
- `yjs-sync`: the node entry holds `nameFormat`
- `yjs-persistence`: a new `nameFormat` column

## Impact

- **Shared types**: `NodeNameFormat`, the `nameFormat` attribute and node property, and a markdown escape helper in `packages/shared`.
- **Storage**: a migration adds `mmp_node.nameFormat`, nullable, where null reads as `text`.
- **Renderer**: `packages/mmp` parses the subset into DOM nodes, edits the source, and keeps the formatting in image export.
- **Frontend**: Mermaid import (with a flag from `packages/mermaid-mindmap-parser`), export, the toolbar and the convert button, with texts in every language.
- **Glossary**: entries for **Markdown name** and **Text name**.
