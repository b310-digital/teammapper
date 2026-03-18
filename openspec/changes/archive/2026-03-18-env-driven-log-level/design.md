## Context

NestJS log levels are hardcoded in `main.ts:26` as `['log', 'error', 'warn', 'debug']`. The `ConfigService` already manages environment-driven configuration and has an `isProduction()` method based on `MODE`. There is no `LOG_LEVEL` env var.

## Goals / Non-Goals

**Goals:**
- Make log verbosity configurable via `LOG_LEVEL` env var
- Provide sensible defaults based on existing `MODE` env var
- Keep the change minimal and consistent with existing `ConfigService` patterns

**Non-Goals:**
- External logging libraries (winston, pino)
- Per-module log level granularity
- Structured/JSON log formatting
- Log output routing (files, external services)

## Decisions

### 1. `LOG_LEVEL` env var with `MODE`-based fallback

**Choice**: Accept `LOG_LEVEL` as a threshold (e.g., `debug` enables `error + warn + log + debug`). When unset, derive from `MODE`: `DEV` → `debug`, else → `log`.

**Alternatives considered**:
- *Only use `MODE`*: Too coarse — can't enable debug in production for troubleshooting without also changing TypeORM `synchronize` and settings file selection.
- *Comma-separated level list*: More flexible but non-standard and harder to document. NestJS levels have a natural hierarchy that threshold-based selection fits.

### 2. Threshold-based level resolution

**Choice**: Map a single level string to the NestJS `LogLevel[]` array using the standard severity order: `error < warn < log < debug < verbose`. Setting `LOG_LEVEL=warn` enables `['error', 'warn']`.

**Rationale**: This matches how most logging frameworks work (log4j, Python logging, etc.) and is more intuitive than listing individual levels.

### 3. Implementation in `ConfigService`

**Choice**: Add `getLogLevels(): LogLevel[]` method to the existing `ConfigService` singleton. Called from `main.ts`.

**Rationale**: Follows the established pattern — all env var access goes through `ConfigService` (see `getPort()`, `isYjsEnabled()`, etc.).

## Risks / Trade-offs

- [Invalid `LOG_LEVEL` value] → Fall back to `MODE`-based default and log a warning at startup. Do not crash.
- [Behavioral change for existing deployments] → None. `MODE=DEV` without `LOG_LEVEL` produces the same `['log', 'error', 'warn', 'debug']` as the current hardcoded value.

## Open Questions

None — scope is small and well-defined.
