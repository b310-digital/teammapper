## Why

The Speculatius app exploration discovered that the existing `import-export` spec only covers JSON and Mermaid import/export but omits image and document export formats (SVG, PNG, JPG, PDF) and the ctrl+e keyboard shortcut for export. These features are already implemented in the app but missing from the spec.

## What Changes

- **Expand import-export spec** with missing export requirements:
  - Add SVG, PNG, JPG, and PDF export format scenarios to the export requirement
  - Add ctrl+e keyboard shortcut scenario for triggering export

## Non-goals

- No code changes — all behavior already exists
- No changes to import functionality specs
- No changes to the existing JSON and Mermaid export scenarios

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `import-export`: Add export format scenarios (SVG, PNG, JPG, PDF) and keyboard shortcut (ctrl+e)

## Impact

- Spec-only change — no code, API, or dependency impact
- `openspec/specs/import-export/spec.md` will be expanded with additional export scenarios
