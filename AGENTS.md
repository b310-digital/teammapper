# Agents

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

## TypeScript strictness

`teammapper-frontend/tsconfig.json` sets `strict: true` and switches two flags
back off:

```jsonc
"strict": true,
"strictNullChecks": false,
"strictPropertyInitialization": false
```

The compiler enforces the rest of `strict`: `noImplicitAny`,
`strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `alwaysStrict`
and `useUnknownInCatchVariables`. The Angular compiler checks templates with
`strictTemplates`, `strictInjectionParameters` and `strictInputAccessModifiers`.

The two disabled flags produce ~205 of the ~240 errors a full `strict: true`
reports, so we turn them on one area at a time. Follow four rules to keep that
migration small:

1. Write types that will pass once `strictNullChecks` is on. Mark what can be
   absent as `T | null` or optional, even though the compiler does not yet
   check it.
2. Do not silence a type error with `!` or `as any`. A non-null assertion moves
   the failure from compile time to runtime. Narrow the value instead, or change
   the type so the null case is representable.
3. Narrow with `error instanceof Error` before reading `.message`, because
   `catch` binds `unknown`.
4. Put the datum on the d3 selection, as in
   `d3.selectAll<SVGPathElement, Node>(...)`. `strictFunctionTypes` rejects an
   annotation on the callback parameter.

Two commands check this:

1. `pnpm --filter teammapper-frontend run tsc` checks the TypeScript.
2. `pnpm --filter teammapper-frontend run build:dev` checks the templates, which
   `tsc` skips.
