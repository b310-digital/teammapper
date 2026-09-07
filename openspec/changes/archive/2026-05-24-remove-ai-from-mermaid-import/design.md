## Context

The `dialog-import-mermaid` component currently serves two purposes: manual mermaid syntax import and AI-powered mermaid generation. The AI section (lines 7-28 in the template) is conditionally shown behind the `featureFlagAI` flag. A dedicated `dialog-import-ai` component already exists and provides a streamlined AI-only workflow. Both dialogs share the same backend endpoint (`POST /api/mermaid/create`).

## Goals / Non-Goals

**Goals:**
- Remove all AI generation UI and logic from `dialog-import-mermaid`
- Simplify the component by removing unused dependencies (AI-related services, properties, imports)
- Keep the mermaid import dialog focused on its core purpose: paste mermaid syntax → import

**Non-Goals:**
- Modifying the dedicated AI import dialog (`dialog-import-ai`)
- Changing the backend mermaid/AI endpoints
- Removing or modifying the toolbar menu structure (both import options remain)
- Changing the feature flag system

## Decisions

### 1. Remove AI code entirely rather than just hiding it

Remove the AI-related code from the component rather than keeping it behind a permanently-false flag.

**Why:** Dead code adds maintenance burden. The dedicated AI dialog is the canonical entry point for AI generation, so this code path will never be needed again.

**Alternatives considered:**
- Keep code but disable via flag → rejected: unnecessary complexity for unused code path

### 2. Clean up unused dependencies

After removing AI logic, the component no longer needs: `HttpService`, `UtilsService`, `SettingsService`, `ChangeDetectorRef`, `MatIcon`, `MatSuffix`. These should be removed from the component's imports and injections.

**Why:** Keeps the component minimal and its dependency list honest.

### 3. Remove only AI-specific translation keys

Translation keys like `MODALS.IMPORT_MERMAID.LABEL_CREATE_FROM_AI` and `MODALS.IMPORT_MERMAID.BUTTON_CREATE_FROM_AI` can be left in translation files — removing them is low-value churn and risks breaking if other code references them.

**Why:** Translation file cleanup is out of scope; focus on functional code changes.

## Risks / Trade-offs

- **[Low] Users accustomed to AI in mermaid dialog** → The dedicated AI dialog provides the same functionality with a better UX. The toolbar menu clearly labels both options.
- **[Low] Unused translation keys remain** → Acceptable tech debt; can be cleaned up in a separate pass.
