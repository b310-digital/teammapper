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
