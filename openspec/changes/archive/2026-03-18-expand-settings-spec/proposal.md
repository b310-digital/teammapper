## Why

The Speculatius app exploration discovered that the existing `settings` spec only covers basic language change and map options toggle, but omits the settings page navigation structure (3 tabs, close button, alt+s shortcut), detailed map options fields (center-on-resizing, font size step, default node names, show-linktext), and the "List of created maps" tab. These features are already implemented but not documented.

## What Changes

- **Expand settings spec** with three requirements documenting existing behavior:
  - Settings page navigation (tab structure, keyboard shortcut, close button)
  - Detailed map options fields (center-on-resizing, font size step/defaults, default node names, show-linktext)
  - List of created maps tab (recently opened maps with deletion dates)

## Non-goals

- No code changes — all behavior already exists
- No changes to existing language change or basic map options specs

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `settings`: Add settings navigation, detailed map options, and map list requirements

## Impact

- Spec-only change — no code, API, or dependency impact
- `openspec/specs/settings/spec.md` will be expanded with three new requirement sections
