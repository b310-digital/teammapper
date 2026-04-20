## Why

The Speculatius app exploration discovered five areas of the mind-map-core capability that are implemented but not documented in the OpenSpec spec: landing page, map info/deletion dialog, internationalization, canvas interaction model, and creating a new map from within the editor. The existing spec only covers basic map creation and persistence.

## What Changes

- **Expand mind-map-core spec** with five requirements documenting existing behavior:
  - Landing page (hero section, feature cards, recently opened mindmaps)
  - Map info and deletion dialog (version, deletion policy, delete button)
  - Internationalization (8 supported languages)
  - Mind map canvas interaction model (node selection enables toolbar, no-selection disables buttons)
  - Create new map from editor (via "Cleans the map" button)

## Non-goals

- No code changes — all behavior already exists
- No changes to existing map creation or persistence specs
- No backend persistence requirements (already covered by existing spec)

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `mind-map-core`: Add landing page, map info/deletion, i18n, canvas interaction, and editor-based creation requirements

## Impact

- Spec-only change — no code, API, or dependency impact
- `openspec/specs/mind-map-core/spec.md` will be expanded with five new requirement sections
