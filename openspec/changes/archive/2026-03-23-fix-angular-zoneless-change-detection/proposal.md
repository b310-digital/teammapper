## Why

Angular 21's `bootstrapApplication()` defaults to zoneless change detection internally (`provideZonelessChangeDetectionInternal()`). Without an explicit `provideZoneChangeDetection()` call, property mutations inside async callbacks (subscribe, await, fetch) no longer trigger re-renders. Users see stale UI until an unrelated click forces change detection. This affects the AI mindmap generator, pictogram search, and other components.

## What Changes

- Convert affected component properties to Angular signals (`signal()`, `computed()`) so change detection is automatic regardless of zone configuration
- Replace the custom `HttpService` (raw `fetch()` wrapper) with Angular's `HttpClient` in affected components, or convert results to signal-compatible patterns
- Ensure all async state mutations use `.set()` / `.update()` on signals instead of direct property assignment
- **No breaking changes** — this is an internal refactor with no API or behavior changes

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `ai-mindmap-generation`: The dialog component's async state management changes from mutable properties to signals
- `import-export`: The mermaid import dialog uses signals for its input state

## Impact

**Affected components (4):**

| Component | File | Issue |
|-----------|------|-------|
| `DialogImportMermaidComponent` | `dialog-import-mermaid.component.ts` | `mermaidInput` set after `await fetch()` |
| `DialogPictogramsComponent` | `dialog-pictograms.component.ts` | `pictos` set inside `.subscribe()` |
| `DialogImportAiComponent` | `dialog-import-ai.component.ts` | `isGenerating` set in async method with `await fetch()` |
| `MindmapsOverviewComponent` | `mindmaps-overview.component.ts` | `cachedAdminMapEntries`, `ownedEntries` set in async `ngOnInit` |

**Dependencies:** None added or removed. Uses existing `@angular/core` signal APIs.

**Risk:** Low — each component is self-contained; changes are property-level refactors with no cross-component effects.
