## Why

The mermaid import dialog currently has two functions: importing existing mermaid syntax AND generating mermaid from an AI description. There is already a dedicated AI import dialog (`dialog-import-ai`) accessible from the toolbar's import menu. Having AI generation in both places is confusing — users don't know which to use, and the mermaid importer's AI section clutters what should be a straightforward paste-and-import workflow.

## What Changes

- Remove the AI generation section (description input + generate button) from `dialog-import-mermaid`
- The mermaid import dialog becomes purely manual: paste mermaid syntax → import
- The dedicated AI import dialog (`dialog-import-ai`) remains unchanged as the single entry point for AI-generated mindmaps
- No backend changes required — the API endpoint is shared and still used by the AI dialog

## Capabilities

### New Capabilities

_(none — this is a removal/simplification)_

### Modified Capabilities

- `import-export`: The mermaid import dialog loses its AI generation feature, becoming a pure mermaid-syntax importer
- `ai-mindmap-generation`: AI generation is no longer accessible from the mermaid import dialog (only from the dedicated AI dialog)

## Impact

- **Frontend components**: `dialog-import-mermaid` — remove AI-related template, properties, and methods (`mindmapDescription`, `featureFlagAI`, `createMermaidMindmapFromServer()`)
- **Frontend services**: `dialog-import-mermaid` may no longer need `MermaidService` injection (used only for AI generation)
- **No backend changes**: The mermaid controller and AI service are still used by `dialog-import-ai`
- **No breaking API changes**: No public APIs affected
- **Tests**: Update/remove tests covering AI generation within the mermaid import dialog
