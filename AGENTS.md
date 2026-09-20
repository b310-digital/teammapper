# Agents

This file holds guidelines and rules for working in this repository. Never use
it as a changelog. Nothing here records what a change did, which files it
touched or when: git history covers that. Every entry states a rule a future
reader has to follow, or a fact about the codebase they need in order to follow
one. Delete an entry when it stops being true rather than appending a note that
supersedes it.

## Playwright MCP

### Setup

The Playwright MCP connects to a headless Chrome running in a separate Docker container (`chrome`) via CDP. Configuration is in `.mcp.json`. Example:

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
