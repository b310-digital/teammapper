# Agents

This file holds guidelines and rules for working in this repository. Never use
it as a changelog. Nothing here records what a change did, which files it
touched or when: git history covers that. Every entry states a rule a future
reader has to follow, or a fact about the codebase they need in order to follow
one. Delete an entry when it stops being true rather than appending a note that
supersedes it.

## Browsers: two containers, two protocols

The `app` container has no browser installed. Two other containers provide one,
and they are not interchangeable:

| Container    | Serves                                      | Protocol                                  |
| ------------ | ------------------------------------------- | ----------------------------------------- |
| `chrome`     | Playwright MCP, for driving the app by hand | CDP, `http://<ip>:9222`                   |
| `playwright` | the e2e suite in `teammapper-frontend/e2e`  | `playwright run-server`, `ws://<ip>:9323` |

In both cases the browser runs outside the `app` container, so `localhost` in a
page URL means _that_ container. Point it at the `app` container instead.

## Playwright MCP

### Setup

The Playwright MCP connects to a headless Chrome running in a separate Docker container (`chrome`) via CDP. Configuration is in `.mcp.json`, which is gitignored and not checked in because the container IP differs per environment — write it yourself from this example:

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

1. Start the dev server: `BINDING=0.0.0.0 pnpm run dev` (run in background;
   a container with nothing installed yet needs the checklist under E2E tests
   first)
2. Wait for the server to be ready: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4200`
3. Resolve the app IP: `getent hosts app`
4. Navigate with Playwright: `browser_navigate` to `http://<resolved-ip>:4200`
5. Use `browser_snapshot` (preferred over screenshots) to inspect the page

## E2E tests

`teammapper-frontend/playwright.config.ts` connects to the `playwright`
container rather than launching a browser. Two variables on the `app` service
in `docker-compose.yml` drive that.

`TESTING_PLAYWRIGHT_WS_ENDPOINT` (`ws://playwright:9323`) is what makes the
config pass `connectOptions`. Without it Playwright launches a browser locally
and every test fails with

```
browserType.launch: Executable doesn't exist at
/home/node/.cache/ms-playwright/webkit-2359/pw_run.sh
```

which reads as a missing browser. It is not one: no browser belongs in the
`app` container, so connect to the `playwright` container rather than running
`npx playwright install`.

`TESTING_PLAYWRIGHT_BASE_URL` (`http://app:4200`) sets `baseURL`. Without it
the fallback is `http://localhost:4200`, which inside the `playwright`
container is the browser's own loopback, where nothing listens.

A container started before these were added to the compose file runs without
them, and the failure looks like a missing browser rather than missing
configuration. Check with `env | grep TESTING_PLAYWRIGHT`, and pass them on the
command line if they are absent:

```bash
getent hosts app playwright   # e.g. 172.18.0.2 app, 172.18.0.5 playwright

cd teammapper-frontend && \
  TESTING_PLAYWRIGHT_WS_ENDPOINT=ws://<playwright-ip>:9323 \
  TESTING_PLAYWRIGHT_BASE_URL=http://<app-ip>:4200 \
  npx playwright test --reporter=list
```

Resolved IPs always work; the compose defaults use hostnames, which resolve
over the compose network.

`--reporter=list` prints one line per test, which reads better in a log than
the configured `html` reporter. Artifacts land under `teammapper-frontend` in
`playwright/output` and `playwright-report/`, both gitignored.

### The client and the image are one version

`@playwright/test` in `teammapper-frontend/package.json` and the
`mcr.microsoft.com/playwright:vX.Y.Z-noble` tag in `docker-compose.yml` must
match, because the protocol between them is not stable across versions. Bump
both in the same commit.

### Checklist from a fresh container

1. `pnpm install --frozen-lockfile`. The compose file mounts `node_modules` as
   named volumes under `/home/node/app`, so a container holding the repo
   anywhere else starts with none of them.
2. `pnpm run build:packages`. The frontend resolves `@teammapper/shared` from
   `dist`, not from source.
3. `BINDING=0.0.0.0 pnpm run dev`, in the background. The frontend `start`
   script is `ng serve --host $BINDING`, and compose supplies `BINDING`; set it
   yourself if your shell lacks it.
4. Wait for both servers, not just the frontend:

   ```bash
   curl -s -o /dev/null http://localhost:4200
   curl -s -o /dev/null http://localhost:3000/api/maps
   ```

   `playwright.config.ts` declares both as `webServer` entries with
   `reuseExistingServer`, so it adopts whatever already listens on 4200 and
   3000 and starts nothing.

5. Run the suite. `webkit` is the only project; the config records that Chrome
   is unusable here because it forces a redirect to https.

## Formatting and lint scope

`.prettierrc` at the repository root is the one prettier config. Every workspace
inherits it. `teammapper-backend/.prettierrc.json` is the only override and
exists because the backend writes no semicolons. Do not add a second config to a
workspace: prettier applies the nearest file and ignores the rest, so a copy
forks the rules without anyone noticing.

Keep `.editorconfig` in agreement with it. Prettier reads `.editorconfig`
wherever no prettier config applies, so an `indent_size` that disagrees
reformats every workspace that lacks one.

Each workspace defines `format` to write and `format:check` to verify. CI runs
`pnpm run format:check`, which fans out to all of them. Give a new workspace
both scripts, or nothing checks its formatting.

`teammapper-frontend/angular.json` lists the directories `ng lint` reads in
`lintFilePatterns`. A directory left out of that list goes unlinted, whatever
`eslint.config.js` matches.

## TypeScript strictness

`teammapper-frontend/tsconfig.json` sets `strict: true` and switches
`strictPropertyInitialization` back off:

```jsonc
"strict": true,
"strictNullChecks": true,
"strictPropertyInitialization": false
```

The compiler enforces the rest of `strict`: `noImplicitAny`, `strictNullChecks`,
`strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `alwaysStrict`
and `useUnknownInCatchVariables`. The Angular compiler checks templates with
`strictTemplates`, `strictInjectionParameters` and `strictInputAccessModifiers`.

Follow five rules:

1. Write class fields that pass once `strictPropertyInitialization` is on:
   initialize them, or declare them `T | null` and assign later.
2. Never silence a type error with `!` or `as any`. A non-null assertion moves
   the failure to runtime. Narrow the value, or change the type so the null
   case is representable.
3. For a value that is missing only until setup runs, write one accessor that
   throws (see `MmpService.map`, `YjsSyncService.doc`) instead of spreading
   `?.` across every use.
4. Narrow with `error instanceof Error` before reading `.message`; `catch`
   binds `unknown`.
5. Put the datum on the d3 selection, as in
   `d3.selectAll<SVGPathElement, Node>(...)`. `strictFunctionTypes` rejects an
   annotation on the callback parameter.

Two commands check this:

1. `pnpm --filter teammapper-frontend run tsc` checks the TypeScript.
2. `pnpm --filter teammapper-frontend run build:dev` checks the templates, which
   `tsc` skips.

## Types and imports

`packages/shared` owns every type that crosses the wire. Import those from
`@teammapper/shared`. Before writing an interface, search the shared package
for one that already describes the payload: a payload typed in two places
drifts, and the copies then disagree about what the server sends.

Derive a variant instead of retyping the fields. `Required<T>` makes every
optional field of `T` mandatory, which is how `UserMapOptions` stays tied to
`MapOptions`. `Required<T>` leaves a declared `| null` alone, so for the node
styling types, whose schemas mark every field `v.nullable`, derive with
`Resolved<T>` instead (see `NodeColors`).

Import from the module that declares the symbol. Never re-export one module's
types from another, and never add a barrel file whose only content is
`export ... from`. A re-export hides where a type comes from and gives one type
two import paths, so both end up in use. `packages/shared/src/index.ts` is the
package entry point and the only exception.
