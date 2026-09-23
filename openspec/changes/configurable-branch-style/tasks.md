## 1. Setting and renderer

- [ ] 1.1 Add `BRANCH_STYLES` and derived `BranchStyle` in `packages/shared`; add `branchStyle` to `UserMapOptions`
- [ ] 1.2 Add `"branchStyle": "tapered"` to `settings.dev.json` and `settings.prod.json`; update backend settings spec fixture
- [ ] 1.3 Add `branchStyle` to mmp `OptionParameters` and `Options`, defaulting silently to `tapered` for missing or unknown values
- [ ] 1.4 Split `drawBranch` into `drawTaperedBranch`, `drawCurvedBranch`, `drawStraightBranch` with an end point helper shared by `tapered` and `curved`; `straight` runs center to center
- [ ] 1.5 Set `fill`, `stroke`, `stroke-width` and `stroke-linecap` per style on draw, and in `Nodes.updateNodeBranchColor`, which today sets both `fill` and `stroke`
- [ ] 1.6 mmp specs: path shape per style, straight ends at both centers, width 2.5 and round caps for both thin styles, default for missing value, detached node draws nothing, color change keeps fill none
- [ ] 1.7 `docs/glossary.md`: add **Branch style** under user settings; reword **Branch** from "the curve the app draws" so it covers straight branches, and call automatic branch colors a user setting there

The default stays `tapered` and there is no UI yet, so the app is unchanged after this section.

## 2. Group map settings and user settings

- [ ] 2.1 Rename the "Map options" tab to "Mind map" and split it into a "Map settings" group (font sizes) and a "User settings" group (toggles, Links, Nodes), each with heading and explanation
- [ ] 2.2 Visible hints below the automatic branch colors toggle and below the Nodes section; replace `TOOLTIPS.AUTO_BRANCH_COLORS` with the same text as its hint
- [ ] 2.3 Translations for the tab name, both headings, both explanations and both hints in every i18n file
- [ ] 2.4 E2E: tab name, both headings and both hints visible; font inputs under map settings are disabled for a read-only viewer, user settings stay enabled
- [ ] 2.5 Update existing settings e2e selectors and `settings.component.spec.ts` tab label checks that rely on the old tab name or card layout

Only markup moves, so every option works as before after this section.

## 3. Branch style UI

- [ ] 3.1 "Branches" section of the User settings group with a `mat-select` bound to `userSettings.mapOptions.branchStyle`, saved via `updateGeneralMapOptions()`
- [ ] 3.2 Show `tapered` when the cached settings lack the key
- [ ] 3.3 Translations in every file of `teammapper-frontend/src/assets/i18n`
- [ ] 3.4 Update settings component spec fixtures
- [ ] 3.5 E2E: select "Curved", return to the map, check branch `stroke` and `fill: none`; reload keeps it; a second browser context still sees tapered branches
- [ ] 3.6 Run `pnpm run tsc`, `pnpm run lint`, `pnpm run format:check`, `pnpm --filter teammapper-frontend run build:dev`
