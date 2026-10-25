Each section is one pull request of roughly 500 changed lines, tests included, and leaves `main` releasable. PR 1 stands on its own. PR 2 needs PR 1. PR 3 and PR 4 need PR 2 and are independent of each other. PR 5 needs PR 3 and PR 4. No feature flag is needed: no client creates a markdown node until PR 5 ships, and every earlier section only renders, stores or converts the attribute.

## 1. PR 1: attribute in shared types and storage (~350 lines)

- [ ] 1.1 Add `NodeNameFormat`, its schema, `nameFormat` on `UserNodeProperties`, `NodeSchema` and `NodePropertySchemas`, and `escapeMarkdown` to `packages/shared`
- [ ] 1.2 Read a missing or invalid `nameFormat` as `text` in `normalizeMapData`
- [ ] 1.3 Add the `nameFormat` column to `MmpNode` and its migration
- [ ] 1.4 Write and read the attribute in persistence, hydration and duplication
- [ ] 1.5 Tests: schema accepts `text` and `markdown` only; escape helper; hydrate and persist round trip; null column reads as `text`; duplication copies

## 2. PR 2: rendering in the renderer (~500 lines)

- [ ] 2.1 Add the markdown parser to `packages/mmp` returning runs per line
- [ ] 2.2 Draw markdown names from runs with `strong`, `em` and `br` through `textContent`, ignoring the deprecated font attributes
- [ ] 2.3 Map `nameFormat` in the node record and property mapping, and redraw on change
- [ ] 2.4 Keep runs in image export as `tspan` elements with weight and style
- [ ] 2.5 Specs: subset rules, nesting, escapes, `snake_case`, literal links, images and HTML; DOM holds no element beyond `strong`, `em` and `br`; text names render unchanged; export keeps bold and italic

## 3. PR 3: editing and toolbar (~450 lines)

- [ ] 3.1 Edit a markdown name as source with Shift+Enter for a line break, and write the source on blur
- [ ] 3.2 Make the bold and italic buttons wrap and unwrap the markers on markdown nodes and read their state from the source
- [ ] 3.3 Add the convert button and the conversion as one transaction and one undo step
- [ ] 3.4 Texts for the convert button in every language file
- [ ] 3.5 Tests: edit round trip; Shift+Enter; paste stays plain; bold and italic on markdown and on text nodes; conversion escapes, wraps, resets the font and undoes in one step; read-only clients see no convert button

## 4. PR 4: Mermaid import and export (~400 lines)

- [ ] 4.1 Set `isMarkdown` in `packages/mermaid-mindmap-parser` for descriptions from markdown strings
- [ ] 4.2 Import markdown strings as source, escape other descriptions, decode `#quot;` and `#96;`, and set `nameFormat: 'markdown'`
- [ ] 4.3 Export markdown names and styled text names as markdown strings, encoding `"` and backticks
- [ ] 4.4 Tests: import and export of every subset construct; round trip; legacy bold export; a name with quotes and backticks; a node with a link

## 5. PR 5: markdown by default (~300 lines)

- [ ] 5.1 Create every new node, tree and AI generated node with `nameFormat: 'markdown'`, and keep the copied format on paste
- [ ] 5.2 Add **Markdown name** and **Text name** to `docs/glossary.md` and note the deprecated bold and italic attributes under **Node**
- [ ] 5.3 E2E: client A types `**Total** *net*` in a new node, client B sees bold and italic parts; an older text node renders unchanged and converts; Mermaid export and import keep the formatting
