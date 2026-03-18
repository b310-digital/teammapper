### Requirement: LOG_LEVEL env var controls NestJS log verbosity
The system SHALL accept a `LOG_LEVEL` environment variable with values: `error`, `warn`, `log`, `debug`, `verbose`. The value acts as a threshold — setting a level enables that level and all levels above it in severity.

The severity order SHALL be: `error` < `warn` < `log` < `debug` < `verbose`.

#### Scenario: LOG_LEVEL=warn enables error and warn only
- **WHEN** `LOG_LEVEL` is set to `warn`
- **THEN** NestJS logger SHALL be configured with `['error', 'warn']`

#### Scenario: LOG_LEVEL=debug enables error, warn, log, and debug
- **WHEN** `LOG_LEVEL` is set to `debug`
- **THEN** NestJS logger SHALL be configured with `['error', 'warn', 'log', 'debug']`

#### Scenario: LOG_LEVEL=verbose enables all levels
- **WHEN** `LOG_LEVEL` is set to `verbose`
- **THEN** NestJS logger SHALL be configured with `['error', 'warn', 'log', 'debug', 'verbose']`

### Requirement: MODE-based default when LOG_LEVEL is not set
When `LOG_LEVEL` is not set, the system SHALL derive the log level from the `MODE` environment variable.

#### Scenario: DEV mode defaults to debug
- **WHEN** `LOG_LEVEL` is not set and `MODE` is `DEV`
- **THEN** NestJS logger SHALL be configured with `['error', 'warn', 'log', 'debug']`

#### Scenario: Non-DEV mode defaults to log
- **WHEN** `LOG_LEVEL` is not set and `MODE` is not `DEV`
- **THEN** NestJS logger SHALL be configured with `['error', 'warn', 'log']`

### Requirement: Invalid LOG_LEVEL falls back to MODE-based default
The system SHALL handle invalid `LOG_LEVEL` values gracefully without crashing.

#### Scenario: Unrecognized LOG_LEVEL value
- **WHEN** `LOG_LEVEL` is set to an unrecognized value (e.g., `trace`)
- **THEN** the system SHALL fall back to the `MODE`-based default and log a warning at startup

### Requirement: ConfigService exposes getLogLevels method
The `ConfigService` SHALL expose a `getLogLevels()` method that returns a `LogLevel[]` array for use by `NestFactory.create()`.

#### Scenario: main.ts uses ConfigService for logger configuration
- **WHEN** the NestJS application is bootstrapped
- **THEN** `NestFactory.create()` SHALL receive its logger levels from `configService.getLogLevels()`

### Requirement: LOG_LEVEL documented in env defaults
The `LOG_LEVEL` variable SHALL be documented in `.env.default`.

#### Scenario: env.default includes LOG_LEVEL
- **WHEN** a developer reads `.env.default`
- **THEN** they SHALL see `LOG_LEVEL` with a comment explaining valid values
