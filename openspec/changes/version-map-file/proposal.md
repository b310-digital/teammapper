## Why

A JSON export carries no version, so the import guesses the format from the layout. Two layouts exist: the bare node list of older releases and the `{nodes, arrows}` object. A third layout would leave the import unable to tell the formats apart. A file from a newer release would then import half-read, or fail with the same message as a corrupt file.

## What Changes

- **Export**: a JSON export writes `version: 2` next to `nodes` and `arrows`.
- **Import**:
  - A bare node list reads as version 1, whose nodes may lack `link`, `isRoot` and `coordinates`. The Mermaid import writes this layout.
  - An object with a `nodes` list reads as version 2, with or without a `version` field.
  - Every node of a version 2 file needs `link` and `isRoot`.
  - Every node id is a UUID.
  - A file with a higher version is rejected with its own message, which asks the user to update TeamMapper.
  - Any other `version` value is rejected.
- **Validator**: `pnpm --filter @teammapper/shared run validate-map-file <file>` reports every error and warning the import finds in a file, without importing it.

## Non-goals

- Reading files of a newer version.
- A version 3 format.

## Capabilities

### Modified Capabilities

- `import-export`: the JSON export writes the map file version, and the JSON import reads files by version.

## Impact

- **Shared**: `parseMapFile`, `validateMapFile` and `formatMapFileReport` in `packages/shared`, plus the `validate-map-file` script.
- **mmp**: the loader checks nodes against `LoadableNodeSchema` from shared.
- **Frontend**: the export writes the version, the import calls `parseMapFile`, and the toolbar shows a dedicated toast for a newer release's file.
- **Glossary**: an entry for **Map file version**.
