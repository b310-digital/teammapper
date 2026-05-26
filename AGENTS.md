# TeamMapper

Collaborative mind-mapping app. Monorepo with pnpm workspaces: `teammapper-backend` (NestJS + TypeORM + PostgreSQL), `teammapper-frontend` (Angular 21 + Angular Material + D3 + yjs), and frontend workspace packages under `teammapper-frontend/packages/*`.

## Development Environment

Everything runs inside a Docker container (`app`). **Do not run docker commands from inside the container.**

```bash
# Start dev servers as detached process
nohup pnpm run dev > /tmp/opencode/dev.log 2>&1 &

# Check status
jobs -l

# View logs
tail -f /tmp/opencode/dev.log
```



Frontend: `http://localhost:4200`, Backend: `http://localhost:3000`.

## Commands (inside `app` container)

### TypeScript
```bash
# Root (all packages)
pnpm run tsc
# Backend
pnpm --filter teammapper-backend run tsc
# Frontend (requires workspace packages built first)
pnpm --filter teammapper-frontend run tsc
```

### Lint & Format
```bash
pnpm run lint        # all packages (ESLint with --fix)
pnpm --filter teammapper-frontend run lint   # Angular ESLint
pnpm --filter teammapper-backend run lint    # NestJS ESLint
pnpm run format      # Prettier all
pnpm exec prettier --write src   # frontend only
```

### Unit Tests
```bash
pnpm run test               # all packages
pnpm --filter teammapper-frontend run test    # Jest via Angular (jest-preset-angular)
pnpm --filter teammapper-backend run test     # Jest
pnpm --filter teammapper-backend run test:e2e # backend e2e (requires test DB)
```

### E2E Tests
```bash
pnpm run test:e2e                  # all e2e
pnpm --filter teammapper-frontend exec playwright test --reporter=list
pnpm --filter teammapper-frontend exec playwright test e2e/app.spec.ts  # single file
```

### Build
```bash
pnpm run build:prod        # full build (frontend + copy to backend/client + backend)
pnpm --filter teammapper-frontend run build:prod  # frontend build (builds packages first)
pnpm --filter teammapper-backend run build        # NestJS build
```

### Migrations
```bash
pnpm run migrate:dev       # dev TypeORM migrations
pnpm --filter teammapper-backend run dev:typeorm:migrate
pnpm --filter teammapper-backend run prod:typeorm:migrate
```

## Verification Order

After making changes, verify in this order:

**Backend:** `lint -> test`
```bash
pnpm --filter teammapper-backend run lint && pnpm --filter teammapper-backend run test
```

**Frontend:** `tsc -> lint -> test -> e2e -> format`
```bash
pnpm --filter teammapper-frontend run tsc && pnpm --filter teammapper-frontend run lint && pnpm --filter teammapper-frontend run test && pnpm --filter teammapper-frontend exec playwright test --reporter=list
```

**Full monorepo:** `tsc -> lint -> test`

## Code Conventions

- **No `any` types.** Use explicit interfaces, enums, and type annotations.
- **Methods max 10 lines.** Extract methods that exceed this limit.
- **Reuse existing code.** Check before adding new types/functions.
- **Error handling.** Always include try/catch blocks.
- **Comments on functions and complex types.** No full JSDoc required.

## Key File Locations

- Root config: `package.json`, `pnpm-workspace.yaml`
- Backend: `teammapper-backend/src/` (NestJS modules, controllers, services)
- Frontend: `teammapper-frontend/src/app/` (Angular modules, components, services)
- Frontend entry: `teammapper-frontend/src/app/root.routes.ts`
- Frontend workspace packages: `teammapper-frontend/packages/*` (e.g. `@teammapper/mermaid-mindmap-parser`)
- Backend config: `teammapper-backend/config/settings.dev.json`, `settings.prod.json`
- Override config: `config/settings.override.json` (runtime overrides prod defaults)
- E2E tests: `teammapper-frontend/e2e/`
- Backend e2e tests: `teammapper-backend/test/`
- Envs: `.env.default` (copy to `.env.prod`)
- Spec-driven changes: `openspec/` (see config for rules)

## OpenSpec (Spec-Driven Changes)

Changes follow a spec-driven workflow. Proposals go in `openspec/changes/`, specs in `openspec/specs/`. See `openspec/config.yaml` for rules. Key constraints:
- Proposals under 500 words, always include a "Non-goals" section.
- Tasks should be structured so the app works after each section; use feature flags if needed.

## Docker & Networking

- Container IPs resolve via `getent hosts <container>`. Hostnames like `app` or `localhost` don't work for Chrome/CDP connections.
- Playwright MCP connects to Chrome in the `chrome` container via CDP (see checklist below).

## Playwright MCP

### Setup

The Playwright MCP connects to headless Chrome in the `chrome` container via CDP. Configuration is in `.mcp.json`. Example:

```
{
    "mcpServers": {
      "playwright": {
        "command": "npx",
        "args": ["@playwright/mcp@latest", "--cdp-endpoint", "http://<CHROME_DOCKER_IP>:9222"]
      }
    }
}
```

### Networking

- The app runs inside the `app` container, Chrome runs in the `chrome` container.
- **Do not use `localhost` or the `app` hostname** to navigate — Chrome cannot resolve them properly.
- **Chrome CDP rejects non-IP Host headers** — Chromium hardcodes a check that the HTTP `Host` header is an IP or `localhost`. There is no flag to disable this. Always use resolved IPs (not hostnames) in CDP endpoint URLs.
- **Resolve container IPs first** with `getent hosts <container>`, then use the IP:

```bash
getent hosts app    # for navigation URLs
getent hosts chrome # for CDP endpoint in .mcp.json
```

### Checklist

1. Start the dev server: `pnpm run dev` (run in background)
2. Wait for the server to be ready: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4200`
3. Resolve the app IP: `getent hosts app`
4. Navigate with Playwright: `browser_navigate` to `http://<resolved-ip>:4200`
5. Use `browser_snapshot` (preferred over screenshots) to inspect the page

## Agent-Browser CLI

`agent-browser` is a CLI tool for browser automation without MCP. It connects to Chrome in the `chrome` container via CDP port 9222.

### Setup

```bash
# Resolve Chrome container IP
getent hosts chrome  # returns something like 172.18.0.2

# Connect to Chrome via CDP
agent-browser connect http://172.18.0.2:9222
```

**Important:** Never install Chrome locally (`agent-browser install` fails on ARM64). Chrome runs in the `chrome` container — always connect via CDP.

### Navigation

```bash
# Resolve app container IP
getent hosts app  # returns app IP (e.g., 172.18.0.1)

# Navigate - use the resolved IP, not hostname or localhost
agent-browser open http://172.18.0.1:4200
agent-browser open http://172.18.0.1:4200/app/settings
```

**Do not use `localhost` or `app` hostname** in navigation URLs — Chrome CDP rejects non-IP Host headers.

### Core Commands

```bash
# Page inspection (preferred over screenshots)
agent-browser snapshot          # DOM snapshot with accessible roles and refs
agent-browser screenshot /tmp/page.png  # visual screenshot

# Interaction
agent-browser click "button:has-text('Create mind map')"
agent-browser click @eref     # click by ref from snapshot
agent-browser type "[ref=e8]" "search text"
agent-browser hover "[ref=e7]"

# JavaScript evaluation
agent-browser eval "document.body.classList.contains('dark-mode')"
agent-browser eval "JSON.parse(localStorage.getItem('settings') || '{}')"

# State
agent-browser eval "window.location.href"
agent-browser eval "document.title"
```

### Reference-Based Interaction

1. Take a snapshot: `agent-browser snapshot`
2. Click by ref: `agent-browser click @eref`
3. Refs are stable within a snapshot — use them across commands in the same page session

### Selectors

```bash
# CSS selectors
agent-browser click "mat-slide-toggle"
agent-browser click "button:has-text('Save')"

# By ref from snapshot
agent-browser click @eref

# By attribute
agent-browser click "[ref=e5]"
```

### Storage & State

The frontend uses `localforage` (IndexedDB), not `localStorage`. To clear:

```bash
agent-browser eval "localStorage.clear(); localforage.clear();"
```

When testing features that depend on cached state (e.g., dark mode settings), clear storage first and re-navigate to trigger fresh initialization.

### Debugging Tips

- **Page seems stuck:** `agent-browser wait 3000` then `agent-browser snapshot`
- **Element not found:** Use `snapshot` to find current refs — page state may have changed
- **Feature not working:** Check if Angular service is initialized by inspecting DOM/state with `eval`
- **Verify CSS class application:** `agent-browser eval "document.body.classList.contains('dark-mode')"`

### Common Patterns

```bash
# Full flow: clear state, navigate, verify
agent-browser open http://172.18.0.1:4200/ && \
agent-browser eval "localStorage.clear(); localforage.clear();" && \
agent-browser wait 1000 && \
agent-browser open http://172.18.0.1:4200/app/settings && \
agent-browser wait 2000 && \
agent-browser snapshot

# Test toggle interaction
agent-browser snapshot && \
agent-browser click @eref && \
agent-browser wait 500 && \
agent-browser snapshot
```

## Subproject Instructions

Frontend conventions: `teammapper-frontend/CLAUDE.md`
Backend conventions: `teammapper-backend/CLAUDE.md`
