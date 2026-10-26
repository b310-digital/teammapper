## Context

A node name is stored as a string in the Y.Doc and in `mmp_node.name`.

- **Rendering**: the renderer in `packages/mmp` draws the name into a `foreignObject` through `innerHTML`, after DOMPurify.
- **Editing**: the editor makes that element `contenteditable`, blocks every Ctrl shortcut except copy, paste, cut, undo and the arrows, and writes the sanitized `innerHTML` back on blur.
- **Persistence**: `sanitizeName` runs sanitize-html with no allowed tags. It strips tags and HTML-escapes the text, so stored names hold entities such as `&amp;` and line breaks as `<br>`.
- **Styling**: applies to the whole name through `font.weight`, `font.style`, `font.size` and `colors.name`.

Mermaid mindmaps accept markdown strings, written ``"`...`"``. Mermaid renders bold (`**` or `__`), italic (`*` or `_`) and line breaks in them, and shows everything else as text. The vendored parser already lexes markdown strings, but it drops the information that the description was one. The Mermaid export writes every name as a plain or quoted string.

## Goals / Non-Goals

**Goals:**

- Bold and italic for parts of a name, and line breaks, in the subset Mermaid supports
- WYSIWYG editing: users never see or type markers
- One storage form: the markdown source, never HTML and never HTML-escaped
- A lossless Mermaid round trip

**Non-Goals:**

- Links, images or other markdown constructs inside a name
- Removing or migrating `font.weight` and `font.style`

## Decisions

### 1. Every name is markdown

The name keeps its column, schema and Y.Doc key, with no extra attribute. The renderer reads every name as markdown.

Existing names change their look in two cases only:

- A name with a deliberately wrapped word such as `*urgent*` turns italic.
- A name with a wrapped underscore pair such as `_draft_` turns italic.

The CommonMark delimiter rules keep `snake_case` and `5 * 3 * 2` plain. Wrapped words are rare in stored maps, and rendering them as emphasis matches the likely intent.

**Alternative rejected:** a per-node `nameFormat` attribute that keeps legacy names on the HTML path. It needs a column, a sync field, a convert button and two render paths. It also does not remove the migration: entity-escaped legacy names would still render through `innerHTML`.

### 2. The subset is Mermaid's

A name supports exactly what Mermaid renders in a markdown string:

- `**x**` and `__x__` for bold
- `*x*` and `_x_` for italic, nested in bold and the other way round
- a newline for a line break
- a backslash escape for `\`, `*` and `_`

Every other construct renders as its literal source text: `[x](y)`, `![x](y)`, `# x`, `- x`, backticks and HTML.

A small parser in `packages/mmp` turns the source into a list of runs `{ text, bold, italic }`, split by line. It is a pure function with its own specs. The renderer builds `<strong>`, `<em>` and `<br>` elements with `textContent` and never assigns `innerHTML` for a name, so no source can inject markup. mmp also exports `markdownToPlainText` for the frontend's plain-text readers.

**Alternative rejected:** `marked` with a token allowlist, as Mermaid does. It adds a dependency to the renderer for three constructs and parses far more than it renders.

### 3. Editing is WYSIWYG

The user never types markdown. On edit, the renderer fills the editable element with the same `strong`, `em` and `br` elements it draws, so the formatting stays visible and no marker shows.

Ctrl+B and Ctrl+I join the editor's allowed shortcuts and call `document.execCommand('bold' | 'italic')` with `styleWithCSS` off. Shift+Enter inserts a `br`. Paste stays plain text.

On blur, a serializer in `packages/mmp` walks the editable element and writes the source through `updateNode('name', ...)`:

- Text nodes become runs, with `\`, `*` and `_` escaped, so typed characters stay literal.
- `b`, `strong` and an inline `font-weight` of 600 or more mark a run bold. `i`, `em` and an inline `font-style: italic` mark it italic.
- `br` and block boundaries (`div`, `p`) become newlines.
- Any other element contributes its text only.

The serializer reads element names and inline styles, never computed styles, because the container carries the whole-node font. It merges adjacent runs with equal formatting and writes `**` and `*` only. A spec pins that parsing the serialized source returns the same runs.

**Alternative rejected:** editing the source. Users would have to learn the markers.

execCommand is deprecated, but every target browser supports it, and the editor already uses it for paste. The serializer keeps the stored source independent of the markup execCommand emits, so a later move to Range-based formatting changes no stored data.

### 4. Whole-node bold and italic stay, and the toolbar follows the editing state

`font.weight` and `font.style` stay on the name's container as the default for every run, and `strong` and `em` add to them.

The toolbar's bold and italic buttons depend on the editing state:

- **While a name is being edited**: the buttons format the selection through the same execCommand calls as the shortcuts. Each button calls `preventDefault` on `mousedown`, so the click keeps the editor's focus and selection. mmp exports `isEditingNodeName`, `toggleNodeNameBold` and `toggleNodeNameItalic`. While the editor is open, mmp emits `nodeNameFormat` with `{ bold, italic }` at the caret on `selectionchange`, and the button state binds to that event.
- **Otherwise**: the buttons set `font.weight` and `font.style`, as today.

Keeping both paths is a low-risk intermediate step. A later change can migrate the whole-node attributes into markers and remove them, once inline formatting has proven itself.

### 5. Migration of stored names

`decodeLegacyName` in `packages/shared` defines the conversion for persistence and JSON import. A TypeORM migration rewrites `mmp_node.name` in batches with the same conversion:

1. Decode HTML entities.
2. Turn `<br>` into a newline.
3. Strip any other tag.

It leaves `*`, `_` and `\` as they are. The migration carries a frozen copy of the function, so a later change to the shared module cannot alter a migration that has already run.

The down migration HTML-escapes the name and turns newlines back into `<br>`. Markers stay as text.

The server drops a map's Y.Doc 30 seconds after the last client leaves, and a deploy restarts the server, so every map hydrates from migrated rows.

`sanitizeName` keeps stripping tags but stops escaping. It runs sanitize-html with no allowed tags, then decodes the entities that sanitize-html wrote.

### 6. Mermaid import and export

The vendored parser keeps its lexer and sets `isMarkdown: true` on a node whose description came from a markdown string. Import keeps such a description as the source, and escapes any other description with `escapeMarkdown`.

Export writes a name as ``"`source`"`` when the name holds formatting or an escape, or when the node has `font.weight` bold or `font.style` italic. In the last case the source is wrapped in the matching markers. Any other name exports as today.

A markdown string cannot hold `"` or a backtick, so export writes them as `#quot;` and `#96;`, and import decodes both. A node with a link keeps today's `[name](href)` form, with the name reduced to its plain text.

### 7. JSON import of older exports

JSON exports carry no format version. Import runs `decodeLegacyName` on a name that holds `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` or `<br>`, and keeps any other name unchanged. A current name that holds such a sequence as literal text is rare.

### 8. Image export keeps the formatting

`Export` currently turns each `foreignObject` into SVG `text` from its `textContent`. It now uses the runs and writes one `tspan` per run, with `font-weight` and `font-style`, keeping one line per `tspan` row as today.

### 9. Plain-text readers

These readers show `markdownToPlainText(name)`:

- the map title in the list of recent mind maps
- the share dialog
- the export file name
- the canvas width estimate in `node-geometry.ts`

## Risks / Trade-offs

- **Old names with wrapped words turn italic or bold.** These are rare and likely intended. The user can undo it by editing the name.
- **Literal entity sequences**:
  - A user who types `&amp;` loses it to decoding in persistence and JSON import.
  - Mitigation: the case is rare, and decoding is the only way to read names stored before the change.
- **Older clients during the rollout** show markers as text until a reload. No data is lost.
- **execCommand markup differs by browser.**
  - Some browsers emit `<b>`, others a styled `<span>`.
  - Mitigation: the serializer accepts every form, with a spec per form.
- **Own parser**: emphasis rules have edge cases. The parser follows CommonMark's delimiter rules for `*` and `_` only, and its specs pin Mermaid's output for the same inputs.

## Migration Plan

1. PR 2 ships the name migration together with the new renderer and the persistence change, because the renderer stops decoding entities.
2. Rollback: revert the deploy and run the down migration, which restores HTML-escaped names.
3. Moving `font.weight` and `font.style` into markers is a separate, later change.
