## 1. ConfigService: Add getLogLevels method

- [x] 1.1 Add `getLogLevels(): LogLevel[]` method to `ConfigService` that reads `LOG_LEVEL` env var, validates it against allowed values (`error`, `warn`, `log`, `debug`, `verbose`), and returns the threshold-based `LogLevel[]` array
- [x] 1.2 When `LOG_LEVEL` is not set, derive default from `MODE` (`DEV` → `debug`, else → `log`)
- [x] 1.3 When `LOG_LEVEL` is invalid, fall back to MODE-based default (log a warning via `console.warn` since the NestJS logger isn't initialized yet)
- [x] 1.4 Write unit tests for `getLogLevels()` covering: each valid level, MODE-based defaults, invalid value fallback

## 2. Wire into NestJS bootstrap and update env docs

- [x] 2.1 Update `main.ts` to use `configService.getLogLevels()` in `NestFactory.create()` instead of the hardcoded array
- [x] 2.2 Add `LOG_LEVEL` to `.env.default` with a comment listing valid values
