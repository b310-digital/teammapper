## Context

`Draw.drawBranch(node)` in `packages/mmp/src/map/handlers/draw.ts` returns a closed `d3.path` built from two cubic Béziers between the parent's center and a point under the child's name. Width is `22 - min(level, 6) * 3`. `Draw.update` inserts one `path.<mapId>_branch` per node before the node groups, so nodes cover the branch start, and sets `fill` and `stroke` to `node.colors.branch`.

User settings come from the server defaults (`teammapper-backend/config/settings.*.json`) and are cached in local storage by `SettingsService`. `MapComponent.ngAfterViewInit` passes `settings.mapOptions` to `MmpService.create`, which hands them to mmp's `Options`. `showLinktext` travels exactly this way. The settings page is its own route (`/app/settings`), so the map is destroyed when the user opens it and created again with fresh settings on return.

## Goals / Non-Goals

**Goals:** one user setting that switches how all branches of every map are drawn in this browser, backwards compatible with cached settings.

**Non-Goals:** see proposal.

## Decisions

### 1. User setting with a closed set of values

```ts
// packages/shared/src/constants
export const BRANCH_STYLES = ['tapered', 'curved', 'straight'] as const;
// packages/shared/src/models/index.ts
export type BranchStyle = (typeof BRANCH_STYLES)[number];
export interface UserMapOptions extends Required<MapOptions> {
  // ...
  branchStyle: BranchStyle;
}
```

**Alternative considered:** a map setting in `MapOptions`, synced through Yjs and persisted. Rejected: the style is visual customization only and must not change what collaborators see.

### 2. Missing key in cached settings

`SettingsService.resolveUserSettings` returns cached settings as they are, so users who visited before this change have no `branchStyle`. mmp's `Options` constructor falls back to `tapered` for a missing or unknown value, silently, the same way it defaults `showLinktext`. An unknown value comes from stale local storage and is not an error, so nothing is logged. The settings component shows `tapered` for a missing value and writes the key on the first change. No settings migration is needed.

### 3. Renderer: one function per style

`drawBranch` keeps its signature and dispatches on `this.map.options.branchStyle`:

- `tapered`: current code, moved to `drawTaperedBranch`.
- `curved`: open path, `moveTo(parent center)`, one `bezierCurveTo` with control points at `(mx, parent.y)` and `(mx, end.y)`, ending at the point the tapered style ends.
- `straight`: `moveTo(parent center)`, `lineTo(child center)`. Both nodes cover the ends, so the visible part runs from node edge to node edge.

`tapered` and `curved` share one helper for the end point under the child's name. Each function stays under 10 lines.

Thin styles set `fill: none` and `stroke: node.colors.branch`. Both use `stroke-width` 2.5 at every level and `stroke-linecap: round`: clearly thinner than a tapered branch, still visible on light branch colors at normal zoom. `Nodes.updateNodeBranchColor` (`packages/mmp/src/map/handlers/nodes.ts`) sets `branch.style.fill` and `branch.style.stroke` to the new color; it must set `fill` only for `tapered`. The same function compares the new color with `node.colors.name` instead of `node.colors.branch`. That bug predates this change and stays out of scope.

No `Options.update('branchStyle')` is needed: the map is created again after the settings page closes.

### 4. Settings UI

The tab is renamed from "Map options" to "Mind map" (new translation key; the card title that reused `PAGES.SETTINGS.MAP_OPTIONS` goes away), because most of what it holds are user settings.

Today the tab mixes map settings (font sizes, disabled without edit rights) and user settings (toggles, default node names) in one card titled "Map options", so a user cannot tell which changes reach collaborators. The tab gets two groups, each a heading with a `mat-card-subtitle`-style explanation:

- **Map settings**, "Shared with everyone on this map": the three font size inputs, moved out of the current first card.
- **User settings**, "Only for you, in this browser": center on resizing, automatic branch colors, the new Branches section, Links and Nodes.

Two kinds of user settings have a shared effect, because they write values onto the nodes a user creates: automatic branch colors (`MmpService` picks the color at node creation) and the root node name and node name defaults. They stay in the User settings group, each with a visible hint saying the value is saved on the node and everyone on the map sees it. The automatic branch colors tooltip (`TOOLTIPS.AUTO_BRANCH_COLORS`) gets the same text as its hint.

The headings use the glossary terms **map settings** and **user settings**. Every input keeps its binding and save call; only the markup moves.

A `mat-select` in a new "Branches" section of the User settings group, bound to `userSettings.mapOptions.branchStyle`, calling `updateGeneralMapOptions()`. It is not disabled outside edit mode, because it changes nothing on the map. Labels are translated in every i18n file.

## Risks / Trade-offs

- **Collaborators talk about a map that looks different on their screens**: accepted, only the branch drawing differs, never the structure.
- **Existing e2e `branch-colors` checks `fill`**: the tests run with the default style, so they stay valid; new tests read `stroke`.
- **Thin branches are hard to see at low zoom**: acceptable for an opt-in style.
- **Straight relies on opaque node backgrounds**: the line runs center to center and is hidden under both nodes only because their backgrounds cover it. The planned change that makes node backgrounds optional must shorten the line to the node edges, or clip it, when a background is off.

## Open Questions

1. Arrowheads: should `curved` and `straight` get an optional SVG marker at the child end, as the issue asks? Needs a glossary name first, since "arrow" is reserved. Proposal: a follow-up change that adds a boolean user setting and a glossary entry.
