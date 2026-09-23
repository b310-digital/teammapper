## Why

Every branch is drawn as a wide, tapered, filled shape (`Draw.drawBranch`). It reads well as a default, but it takes a lot of room, and dense mind maps get crowded. Issue #1359 asks for less space-consuming ways to draw the connection between a parent node and its child.

## What Changes

- **New user setting `branchStyle`** with three values:
  - `tapered`: today's filled shape that narrows with depth. Default.
  - `curved`: a thin stroked curve, 2.5px wide at every level.
  - `straight`: a straight segment from parent center to child center, 2.5px wide at every level.
- **User setting, not map setting**: the style is a visual preference of one browser, like `showLinktext` and `autoBranchColors`. It lives in `UserMapOptions`, is stored locally with the other user settings, and applies to every map this browser opens. Collaborators keep their own style, and nothing is synced or persisted on the server.
- **Renderer support in `@teammapper/mmp`**: `OptionParameters` and `Options` gain `branchStyle`, and `Draw.drawBranch` dispatches on it. Thin styles draw with `stroke` in the branch color and `fill: none`.
- **Settings page**: the "Map options" tab is renamed "Mind map" and splits into two headed groups, "Map settings" (shared with everyone on the map: font sizes) and "User settings" (only this browser: toggles, node names, branch style), so users see what they share. Settings that write onto created nodes (automatic branch colors, default node names) get a hint saying so. The "Branch style" select sits in a new "Branches" section of the user group.
- **Server defaults**: `settings.dev.json` and `settings.prod.json` set `"branchStyle": "tapered"`.

## Non-goals

- Optional node backgrounds, also mentioned in #1359. That is a node styling change (`colors.background`) and gets its own change.
- Arrowheads at the child end. The glossary reserves the word "arrow" for a future relation between non-parent-child nodes, so an arrowhead on a branch needs a glossary decision first (see design, open questions).
- A map setting that makes all collaborators see the same style.
- Per-node or per-subtree branch styles.
- Changing the style of exported images for other people: an SVG or PNG export shows the exporting user's style.

## Capabilities

### New Capabilities

- `branch-style`: the `branchStyle` user setting, its values and default, and how the renderer draws each style.

### Modified Capabilities

- `settings`: the tab is renamed "Mind map", groups options into map settings and user settings, and lists a branch style select.

## Impact

- **`packages/shared`**: `BRANCH_STYLES` constant, derived `BranchStyle` type, `UserMapOptions.branchStyle`.
- **`packages/mmp`**: `options.ts`, `handlers/draw.ts`.
- **Frontend**: settings component, template and every i18n file. `MapComponent` already passes `settings.mapOptions` to `MmpService.create`, so the style reaches mmp with no extra wiring.
- **Backend**: the two settings JSON files only. No schema, entity, Yjs or migration change.
- **Glossary**: new entry **Branch style**; **Branch** no longer says "curve", and calls automatic branch colors a user setting.
- **Compatibility**: settings cached before this change lack the key, and mmp then draws `tapered`, exactly as today.
