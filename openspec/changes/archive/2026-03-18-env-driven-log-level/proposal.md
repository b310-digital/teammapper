## Why

NestJS log levels are hardcoded in `main.ts` with `debug` always enabled. This produces noisy output in production and there's no way to adjust verbosity without code changes. The `MODE` env var already exists but isn't wired to logging.

## What Changes

- Add `LOG_LEVEL` env var support to `ConfigService` with values: `error`, `warn`, `log`, `debug`, `verbose`
- When `LOG_LEVEL` is not set, derive a sensible default from `MODE` (`DEV` → `debug`, else → `log`)
- Wire `ConfigService.getLogLevels()` into `NestFactory.create()` in `main.ts`
- Add `LOG_LEVEL` to `.env.default` documentation

## Non-goals

- Replacing NestJS built-in logger with an external library (winston, pino)
- Per-module or per-service log level configuration
- Structured/JSON logging format changes
- Log output destinations (file, external service)

## Capabilities

### New Capabilities
- `log-level-config`: Environment-driven NestJS log level configuration via `LOG_LEVEL` env var with `MODE`-based defaults

### Modified Capabilities

## Impact

- **Backend only**: `teammapper-backend/src/config.service.ts` and `teammapper-backend/src/main.ts`
- **Env config**: `.env.default` updated with new `LOG_LEVEL` variable
- **No breaking changes**: Existing deployments without `LOG_LEVEL` set will get the same behavior as today (debug enabled when `MODE=DEV`)
