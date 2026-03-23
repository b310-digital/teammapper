## Context

Angular 21 internally defaults to zoneless change detection via `provideZonelessChangeDetectionInternal()` in `bootstrapApplication()`. The app's `main.ts` never calls `provideZoneChangeDetection()`, so zone.js is loaded but unused by Angular's change detection scheduler. Property mutations in async callbacks (await, subscribe) no longer trigger re-renders.

Four components are affected — they set plain class properties after async operations and expect Angular to detect the change automatically.

## Goals / Non-Goals

**Goals:**
- Fix all 4 affected components so async state updates trigger re-renders under zoneless change detection
- Use Angular signals (`signal()`) as the primary mechanism — this is Angular's forward-looking approach
- Keep changes minimal and scoped to affected properties only

**Non-Goals:**
- Migrating the entire app to signals (only fix broken components)
- Removing zone.js from polyfills (separate concern)
- Refactoring the custom `HttpService` to use `HttpClient` (out of scope — would be a larger cross-cutting change)
- Adding `provideZoneChangeDetection()` as a fallback (that's Option A, we're doing Option B)

## Decisions

### 1. Use `ChangeDetectorRef.markForCheck()` instead of signals for `ngModel`-bound properties

**Choice:** For properties bound with `[(ngModel)]` (`mermaidInput`, `mindmapDescription`, `searchTerm`, `isGenerating`), inject `ChangeDetectorRef` and call `markForCheck()` after async mutations.

**Why not signals:** `[(ngModel)]` requires a writable property — it cannot bind to a `WritableSignal` without a custom `ControlValueAccessor` or switching to reactive forms. Converting these to signals would require template rewrites from `[(ngModel)]="prop"` to `[ngModel]="prop()" (ngModelChange)="prop.set($event)"`, which adds complexity for no functional gain.

**Alternatives considered:**
- **Signals + split binding**: `[ngModel]="prop()" (ngModelChange)="prop.set($event)"` — works but verbose and error-prone for every bound input
- **Reactive forms**: Overkill for simple text inputs in dialogs

### 2. Use signals for display-only properties

**Choice:** Convert `pictos` (pictogram search results), `cachedAdminMapEntries`, and `ownedEntries` to `WritableSignal<T>` since they are read-only in templates (iterated with `@for`, checked with `@if`).

**Why:** These properties are set once after an async call and only read in the template. Signals are the cleanest solution — `.set()` automatically notifies the change detection scheduler.

**Template changes:** Minimal — signal reads use `()` syntax:
- `@for (picto of pictos(); ...)` instead of `@for (picto of pictos; ...)`
- `@if (ownedEntries().length > 0)` instead of `@if (ownedEntries && ownedEntries.length > 0)`

### 3. One `markForCheck()` call at the end of each async method

**Choice:** Place a single `this.cdr.markForCheck()` at the end of each async method (or in `finally` block) rather than after every individual property mutation.

**Why:** Simpler, less invasive, and sufficient — Angular batches change detection, so one notification per async operation is enough. This keeps methods clean and avoids scattered CD calls.

## Risks / Trade-offs

**[Mixed approach — signals + markForCheck]** → Accepted. Using two patterns in the same codebase is pragmatic given `ngModel` constraints. A future migration to reactive forms or signal-based forms would allow full signal adoption.

**[Template changes for signal reads]** → Low risk. The `()` syntax is straightforward. Forgetting `()` causes a compile error (signal object instead of value), so mistakes are caught at build time.

**[Undiscovered affected components]** → Mitigated by scoping to the 4 known components. If more surface later, the same pattern applies. A broader audit can be done separately.
