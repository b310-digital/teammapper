## 1. Remove AI from Mermaid Import Dialog

- [x] 1.1 Remove AI-related template section from `dialog-import-mermaid.component.html` (lines 7-28: the `@if (featureFlagAI)` blocks with description textarea and generate button)
- [x] 1.2 Remove AI-related properties and methods from `dialog-import-mermaid.component.ts` (`mindmapDescription`, `featureFlagAI`, `createMermaidMindmapFromServer()`)
- [x] 1.3 Remove unused service injections from `dialog-import-mermaid.component.ts` (`HttpService`, `UtilsService`, `SettingsService`, `ChangeDetectorRef`, `ToastrService`)
- [x] 1.4 Remove unused Angular Material imports no longer needed (`MatIcon`, `MatSuffix`)
- [x] 1.5 Remove unused import statements for removed dependencies

## 2. Update Tests

- [x] 2.1 Update or remove unit tests in `dialog-import-mermaid` that cover AI generation functionality
- [x] 2.2 Add a test verifying the mermaid import dialog does not render AI generation elements
- [x] 2.3 Verify existing mermaid import tests still pass (paste-and-import workflow)

## 3. Verification

- [x] 3.1 Run `pnpm run tsc` to verify no type errors
- [x] 3.2 Run `pnpm run lint` to verify no lint errors
- [x] 3.3 Run `pnpm run test` to verify all unit tests pass
- [x] 3.4 Run `pnpm run prettier --write src` to format code
