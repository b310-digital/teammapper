## 1. DialogImportMermaidComponent — markForCheck after AI generation

- [x] 1.1 Inject `ChangeDetectorRef` in `DialogImportMermaidComponent`
- [x] 1.2 Add `this.cdr.markForCheck()` at the end of `createMermaidMindmapFromServer()` (both success and error paths)
- [x] 1.3 E2E test: AI-generated mermaid content appears in textarea immediately (mock API)

## 2. DialogImportAiComponent — markForCheck after generation

- [x] 2.1 Inject `ChangeDetectorRef` in `DialogImportAiComponent`
- [x] 2.2 Add `this.cdr.markForCheck()` in the `finally` block of `generateAndImport()` so `isGenerating` state reflects immediately
- [x] 2.3 E2E test: generate button disables during generation (mock API with delay)

## 3. DialogPictogramsComponent — signals for search results

- [x] 3.1 Convert `pictos` property to `WritableSignal<IPictogramResponse[]>` using `signal([])`
- [x] 3.2 Update `search()` to use `this.pictos.set(pictos)` inside the subscribe callback
- [x] 3.3 Update template: `@for (picto of pictos(); ...)` and `@if (!pictos().length)`
- [x] 3.4 E2E test: pictogram search results appear immediately (mock ARASAAC API)

## 4. MindmapsOverviewComponent — signals for async-loaded lists

- [x] 4.1 Convert `cachedAdminMapEntries` and `ownedEntries` to `WritableSignal<CachedAdminMapEntry[]>` using `signal([])`
- [x] 4.2 Update `ngOnInit()` to use `.set()` for both properties
- [x] 4.3 Update template: `@if (ownedEntries().length > 0)`, `@for (ownedEntry of ownedEntries(); ...)`, `@for (cachedMapEntry of cachedAdminMapEntries(); ...)`
- [x] 4.4 Covered by existing navigation e2e tests (maps list renders on page load)

## 5. Tests and validation

- [x] 5.1 Run `pnpm run tsc` — confirm no type errors from signal changes
- [x] 5.2 Run `pnpm run lint` — confirm no lint issues
- [x] 5.3 Run `pnpm run test` — confirm existing tests pass (updated pictos signal access in spec)
- [x] 5.4 Run `pnpm run prettier --write src` — format all changed files
- [x] 5.5 Run full e2e suite — all 22 tests pass (19 existing + 3 new)
