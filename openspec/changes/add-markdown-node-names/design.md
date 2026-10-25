## Context

A node name is stored as a string in the Y.Doc and in `mmp_node.name`. The renderer in `packages/mmp` draws it into a `foreignObject` and sanitizes it with DOMPurify. Editing makes that element `contenteditable` and writes the sanitized `innerHTML` back on blur. Styling applies to the whole name through `font.weight`, `font.style`, `font.size` and `colors.name`.

Mermaid mindmaps accept markdown strings, written ``"`...`"``. Mermaid renders bold (`**` or `__`), italic (`*` or `_`) and line breaks in them and shows everything else as text. The vendored parser already lexes markdown strings, but drops the information that the description was one. The Mermaid export writes every name as a plain or quoted string.

## Goals / Non-Goals

**Goals:**

- Bold and italic for parts of a name, and line breaks, in the subset Mermaid supports
- Every existing map renders unchanged
- Lossless Mermaid round trip for markdown names
- One storage form: the markdown source, never HTML

**Non-Goals:**

- Links, images or other markdown constructs inside a name
- Removing the deprecated `font.weight` and `font.style`
- Migrating existing names

## Decisions

### 1. A per-node `nameFormat` attribute

`nameFormat` is `'text' | 'markdown'`, optional, and a missing value reads as `'text'`. It is a top-level field of the node entry, like `protected`, and a node property for single updates. `NodeNameFormat` and its schema live in `packages/shared`.

Every node a current client creates gets `'markdown'`: add child, add tree, paste, Mermaid import and AI generation. Copy and paste keeps the format of the copied node. JSON import keeps the value it finds and treats a missing one as `'text'`, so an older export renders as it did.

**Alternative rejected:** read every name as markdown. Existing names holding `*`, `_` or `\` would change their rendering without anyone editing them.

**Alternative rejected:** a migration that escapes every existing name and flips it to markdown. It rewrites every row, misses Y.Docs held in memory, caches and old JSON exports, and still needs the attribute for older clients.

### 2. The subset is Mermaid's

A markdown name supports exactly what Mermaid renders in a markdown string:

- `**x**` and `__x__` for bold
- `*x*` and `_x_` for italic, nested in bold and the other way round
- a newline for a line break
- a backslash escape for `\`, `*` and `_`

Any other construct, `[x](y)`, `![x](y)`, `# x`, `- x`, backticks or HTML, renders as its literal source text. The rules follow CommonMark emphasis, so `snake_case_name` stays plain.

A small parser in `packages/mmp` turns the source into a list of runs `{ text, bold, italic }` split by line. It is a pure function with its own specs. The renderer builds `<strong>`, `<em>` and `<br>` elements with `textContent` and never assigns `innerHTML` for a markdown name, so no source can inject markup.

**Alternative rejected:** `marked` with a token allowlist, as Mermaid does. It adds a dependency to the renderer for three constructs and parses far more than it renders.

### 3. Editing shows the source

On edit, the renderer fills the editable element with the source as `textContent`. Shift+Enter inserts a line break. On blur it reads `innerText`, normalizes line endings, writes the source through `updateNode('name', ...)` and draws the rendered runs again. Paste stays plain text. Text names keep today's editing path untouched.

### 4. Deprecated bold and italic

`font.weight` and `font.style` keep applying to text names, and the sanitization rule for their values stays. On a markdown node the renderer ignores them, and the bold and italic buttons edit the source instead: they wrap the whole name in `**` or `*`, or remove the markers when the whole name is already wrapped. The button state reads the markers. No client writes `font.weight` or `font.style` on a markdown node.

### 5. Converting a text name

A toolbar button, shown only for a writable text node, converts it in one transaction: escape `\`, `*` and `_` in the name, wrap it in the markers of the deprecated bold and italic, reset both to `normal` and set `nameFormat` to `'markdown'`. One undo step reverts all of it. There is no conversion back.

### 6. Mermaid import and export

The vendored parser keeps its lexer and sets `isMarkdown: true` on a node whose description came from a markdown string. Import keeps such a description as the source, and escapes any other description before storing it, since every imported node is markdown.

Export writes a markdown node as ``"`source`"``. A text node with deprecated bold or italic is exported as the markdown string of its escaped, wrapped name. Any other text node is exported as today. A markdown string cannot hold `"` or a backtick, so export writes them as `#quot;` and `#96;` and import decodes both. A node with a link keeps today's `[name](href)` form, with a markdown name reduced to its plain text.

### 7. Image export keeps the formatting

`Export` currently turns each `foreignObject` into SVG `text` from its `textContent`. For a markdown name it uses the runs instead and writes one `tspan` per run with `font-weight` and `font-style`, one line per `tspan` row as today.

### 8. Storage

A migration adds `mmp_node.nameFormat varchar(16) NULL`. Persistence writes the attribute, hydration reads it, and duplication copies it. Null reads as `'text'`, so existing rows need no update.

## Risks / Trade-offs

- **Older clients show markdown source** → A client from before the change ignores `nameFormat` and shows `**word**`. The text stays readable, and a reload fixes it.
- **Two styling paths until the deprecated attributes go** → Deprecated attributes stay until a later change removes them. The convert button gives every map a way off them.
- **Entity codes in Mermaid** → Other Mermaid renderers may show `#quot;` verbatim inside a mindmap markdown string. Quotes in names are rare.
- **Own parser** → Emphasis rules have edge cases. The parser follows CommonMark's delimiter rules for `*` and `_` only, and its specs pin Mermaid's output for the same inputs.

## Migration Plan

One migration adds the nullable column and drops it on the way down. No data changes. Clients deploy with the server; mixed versions during a rollout lose no data, because older clients keep the attribute untouched when they rewrite other fields of a node entry.
