## Context

The project has 11 Playwright e2e test files that serve as the de facto specification for application behavior, but no formal specs exist outside of `log-level-config`. This change creates lightweight spec files derived 1:1 from e2e test assertions — no code changes involved.

## Goals / Non-Goals

**Goals:**
- Create one spec file per capability listed in the proposal (9 total)
- Each spec documents only behavior verified by existing e2e tests
- Specs use requirement/scenario format consistent with existing `log-level-config` spec

**Non-Goals:**
- Documenting behavior not covered by e2e tests
- Covering Yjs-related functionality (separate changes handle those)
- Adding new e2e tests or modifying existing ones
- Any application code changes

## Decisions

### Spec granularity: one folder per capability
Node editing, node images, and node links are grouped into a single `node-operations` spec since they all operate on individual nodes. Other capabilities get their own folder.

**Alternative considered:** 1:1 mapping of e2e file to spec file. Rejected because the three node-related test files cover closely related behavior on the same entity.

### Spec depth: match e2e assertions only
Each requirement/scenario maps directly to an e2e test assertion. No extrapolation beyond what tests verify.

**Alternative considered:** Comprehensive specs that also cover untested behavior. Rejected — that would be aspirational rather than documenting known-good behavior.

### Spec format: requirement + scenario blocks
Follow the same structure as `openspec/specs/log-level-config/spec.md` — requirement headings with WHEN/THEN scenario blocks.

## Risks / Trade-offs

- [Incomplete coverage] Specs only reflect what e2e tests check, not full feature behavior → Acceptable; specs can be expanded later when new tests are added
- [Maintenance burden] Specs may drift from e2e tests over time → Mitigated by keeping specs lightweight and tied to observable behavior
