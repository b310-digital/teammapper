# Backend for TeamMapper

## Description

Backend for TeamMapper, build with [Nest](https://github.com/nestjs/nest)

## Installation

-  Install dependencies
```bash
$ npm install
```

- Duplicate and rename `.env.default`

```bash
cp .env.default .env
```

Change variables according to your preference

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# start backend and frontend at the same time
# frontend is accessible via localhost:4200
$ pnpm run dev

# production mode
$ pnpm run start:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Environment Variables

Copy `.env.default` to `.env` and configure the variables below.

### Required

| Variable | Description |
|---|---|
| `POSTGRES_HOST` | PostgreSQL host |
| `POSTGRES_PORT` | PostgreSQL port |
| `POSTGRES_USER` | PostgreSQL user |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DATABASE` | PostgreSQL database name |

### Application

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `MODE` | `DEV` disables SSL | `DEV` |
| `DELETE_AFTER_DAYS` | Days before unused maps are deleted | `30` |

### PostgreSQL (optional)

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_SSL` | Enable SSL for database connections | `true` |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED` | Reject unauthorized SSL certificates | `true` |
| `POSTGRES_QUERY_TIMEOUT` | Query timeout in ms | `100000` |
| `POSTGRES_STATEMENT_TIMEOUT` | Statement timeout in ms | `100000` |

### Yjs Real-time Collaboration

| Variable | Description | Default |
|---|---|---|
| `YJS_ENABLED` | Enable Yjs WebSocket server | `false` |
| `FEATURE_YJS_RATE_LIMITING` | Enable WebSocket connection rate limiting | `false` |
| `WS_TRUST_PROXY` | Trust `X-Forwarded-For` header for client IP resolution (enable when behind a reverse proxy) | `false` |
| `WS_GLOBAL_MAX_CONNECTIONS` | Maximum total WebSocket connections | `500` |
| `WS_PER_IP_MAX_CONNECTIONS` | Maximum WebSocket connections per IP | `50` |
| `WS_PER_IP_RATE_LIMIT` | Maximum connection attempts per IP within the rate window | `10` |
| `WS_PER_IP_RATE_WINDOW_MS` | Sliding window duration for rate limiting in ms | `10000` |

### AI / LLM Integration

| Variable | Description | Default |
|---|---|---|
| `AI_LLM_URL` | LLM service URL | - |
| `AI_LLM_TOKEN` | LLM API token | - |
| `AI_LLM_PROVIDER` | LLM provider (`openai` or `openai-compatible`) | `openai` |
| `AI_LLM_MODEL` | LLM model name | - |
| `AI_LLM_TPM` | Tokens per minute limit | - |
| `AI_LLM_TPD` | Tokens per day limit | - |
| `AI_LLM_RPM` | Requests per minute limit | - |

> **Migration note:** The previous `stackit` provider value for `AI_LLM_PROVIDER` has been replaced by `openai-compatible`. If you were using `AI_LLM_PROVIDER=stackit`, change it to `AI_LLM_PROVIDER=openai-compatible`.

### Authentication

| Variable | Description | Default |
|---|---|---|
| `JWT_SECRET` | Secret for signing JWT tokens | - |

### Testing

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_TEST_HOST` | Test database host | - |
| `POSTGRES_TEST_PORT` | Test database port | `5432` |
| `POSTGRES_TEST_USER` | Test database user | - |
| `POSTGRES_TEST_PASSWORD` | Test database password | - |
| `POSTGRES_TEST_DATABASE` | Test database name | - |

## Static File Serving & SPA Routing

In production, the compiled frontend is copied into the backend's `client/` directory and served by NestJS:

- **`/assets/*`** — Served directly by Express static middleware with cache headers (24h for images/fonts).
- **All other known routes** — Served by `ServeStaticModule` which returns `index.html` for client-side routing.

The `ServeStaticModule` uses a `renderPath` regex to restrict the SPA fallback to known frontend routes only:

```
/            → About page
/map         → Map landing
/map/:id     → Map editor
/app/settings   → Settings
/app/shortcuts  → Shortcuts
```

**Why `renderPath` is needed:** Without it, any unknown path returns `index.html` with HTTP 200. This causes bots and crawlers that ignore `<base href="/">` to resolve the relative asset paths in the HTML against the current URL, creating infinitely nesting request loops (e.g. `/map/assets/icons/assets/icons/...`).

**When adding new frontend routes:** If a new top-level route is added to the Angular router (in `root.routes.ts`), the `renderPath` regex in `app.module.ts` must be updated to include it.

## Typeorm
For a list of commands check https://github.com/typeorm/typeorm/blob/master/docs/using-cli.md

Some useful commands include:

Drop schema

```bash
pnpm run dev:typeorm schema:drop
```

Run migrations in development:

```bash
pnpm run dev:typeorm migration:run
```

Run migrations in production (see https://github.com/typeorm/typeorm/blob/master/docs/migrations.md):

```bash
pnpm run prod:typeorm:migrate
```

Generate new migration based on current changes

```bash
pnpm run dev:typeorm migration:generate AddSomethingHere
```

## License

Nest and teammapper are [MIT licensed](LICENSE).
