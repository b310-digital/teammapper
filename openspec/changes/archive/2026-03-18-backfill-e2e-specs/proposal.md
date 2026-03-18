## Why

The project has 11 Playwright e2e test files covering core features but only 1 formal spec (`log-level-config`). This means implemented behavior is undocumented outside of test code. Backfilling specs from existing e2e tests creates a single source of truth for what the application does today, making future changes easier to reason about.

## What Changes

- Add 9 new capability specs derived directly from existing e2e tests
- Specs are intentionally lightweight — they document only what e2e tests verify, not aspirational behavior
- No code changes; this is purely documentation of existing behavior

## Capabilities

### New Capabilities
- `mind-map-core`: Map creation, root node rendering, node addition, persistence across page reload
- `node-operations`: Add/remove nodes via floating buttons, bold/italic text formatting, node dragging, image upload to nodes, add/remove hyperlinks on nodes
- `branch-colors`: First-level branches get distinct colors, child nodes inherit parent branch color
- `import-export`: Import menu with JSON and Mermaid options, JSON file upload import, Mermaid syntax import with color handling
- `undo-redo`: Undo reverts last action, redo restores it (button-driven)
- `settings`: Language selection, map options tab with auto branch colors toggle and font size configuration
- `zoom-controls`: Zoom in, zoom out, center map buttons
- `share-functionality`: Share dialog with QR code, copy link, editable/view-only toggle, download and duplicate actions
- `navigation`: Navigate to settings page and back, navigate to shortcuts page

### Modified Capabilities
_(none — all new specs)_

## Impact

- `openspec/specs/` — 9 new spec folders added
- No application code affected
- No existing specs modified
