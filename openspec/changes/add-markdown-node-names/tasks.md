Each section is one pull request of roughly 500 changed lines, tests included, and leaves `main` releasable. PR 1 stands on its own. PR 2 needs PR 1. PR 3 and PR 4 need PR 2 and are independent of each other. No feature flag is needed. Until PR 3 ships, no client writes formatting, and PR 2 renders the stored names unchanged apart from rare wrapped words.

## 1. PR 1: shared helpers and the parser (~350 lines)

- [ ] 1.1 Add `escapeMarkdown` and `decodeLegacyName` to `packages/shared`. `decodeLegacyName` decodes entities, turns `<br>` into a newline and strips other tags.
- [ ] 1.2 Add the markdown parser and `markdownToPlainText` to `packages/mmp`, returning runs per line, and export both from the entry point
- [ ] 1.3 Specs:
  - escape helper
  - `decodeLegacyName` with `Tom &amp; Jerry`, `first<br>second` and `a &lt; b`
  - parser subset rules, nesting, escapes, `snake_case` and `5 * 3 * 2`
  - literal links, images and HTML

## 2. PR 2: store and render markdown names (~500 lines)

- [ ] 2.1 Add the TypeORM migration that rewrites `mmp_node.name` with a frozen copy of the conversion, in batches, with a down migration
- [ ] 2.2 Make `sanitizeName` strip tags without escaping, and update `sanitization.spec.ts` and `clientServerMapping.spec.ts`
- [ ] 2.3 Draw every name from runs with `strong`, `em` and `br` through `textContent`, on top of the whole-node font. Remove the DOMPurify name handling in `node-marks.ts` and `draw.ts`.
- [ ] 2.4 Switch these plain-text readers to `markdownToPlainText`:
  - the recent mind maps list
  - the share dialog
  - the export file name
  - the canvas width estimate
- [ ] 2.5 Keep runs in image export as `tspan` elements with weight and style
- [ ] 2.6 Specs:
  - migration up and down
  - the DOM holds no element beyond `strong`, `em` and `br`
  - a name arriving as `<img src=x onerror=alert(1)>` shows as text
  - `a < b & c` round-trips unescaped
  - export keeps bold and italic
  - the existing `node-editing`, `node-sizes` and `two-client-sync` e2e specs pass

## 3. PR 3: WYSIWYG editing and toolbar (~600 lines)

- [ ] 3.1 Edit names WYSIWYG:
  - fill the editor with the rendered runs
  - allow Ctrl+B and Ctrl+I through `execCommand` with `styleWithCSS` off
  - insert a `br` on Shift+Enter
  - serialize the editor DOM to the source on blur, escaping typed `\`, `*` and `_`
- [ ] 3.2 Export `isEditingNodeName`, `toggleNodeNameBold` and `toggleNodeNameItalic` from mmp, and emit `nodeNameFormat` on `selectionchange` while editing. Update the frontend mmp mock.
- [ ] 3.3 Route the toolbar's bold and italic to the selection while editing, call `preventDefault` on `mousedown`, and bind the button state to `nodeNameFormat`. Keep the whole-node toggle otherwise.
- [ ] 3.4 Add **Inline formatting** to `docs/glossary.md`
- [ ] 3.5 Tests:
  - the serializer handles `b`, `strong`, `i`, `em`, a styled `span`, `br`, `div` lines, unknown elements and typed markers, and its output parses back to the same runs
  - Shift+Enter, and paste staying plain
  - the toolbar formats the selection while editing, keeps the editor open and follows the caret
  - the toolbar toggles the whole node when not editing
- [ ] 3.6 E2E:
  - client A types `Total net`, bolds `Total` with Ctrl+B and italicizes `net` with the toolbar while editing
  - client B sees the bold and italic parts
  - a reload keeps them
  - typed `**x**` stays literal

## 4. PR 4: Mermaid and JSON import and export (~400 lines)

- [ ] 4.1 Set `isMarkdown` in `packages/mermaid-mindmap-parser` for descriptions from markdown strings
- [ ] 4.2 Import markdown strings as source, escape other descriptions, and decode `#quot;` and `#96;`
- [ ] 4.3 Export formatted names and names with whole-node bold or italic as markdown strings, encoding `"` and backticks
- [ ] 4.4 Run `decodeLegacyName` in JSON import on names holding an entity or `<br>`
- [ ] 4.5 Tests:
  - import and export of every subset construct, and the round trip
  - export of a whole-node bold name
  - a name with quotes and backticks
  - a node with a link
  - JSON import of `Tom &amp; Jerry`
