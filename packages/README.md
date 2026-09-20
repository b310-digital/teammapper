# Workspace packages

Libraries shared between the applications in this repository. Each one is a
pnpm workspace package under the `@teammapper` scope and is built to `dist/`
before the applications compile (`pnpm run build:packages` from the root).

| Package                         | Purpose                                                                                                | Consumers                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `shared` (`@teammapper/shared`) | Domain models, validation schemas and algorithms that cross the wire. Runs in Node and in the browser. | `teammapper-backend`, `teammapper-frontend`, `mmp` |
| `mmp` (`@teammapper/mmp`)       | The mind map renderer built on d3, forked from cedoor/mmp. Browser-only: it needs a DOM.               | `teammapper-frontend`                              |
| `mermaid-mindmap-parser`        | Parser for Mermaid mindmap syntax, vendored from the mermaid project. Has no lint script by design.    | `teammapper-frontend`                              |

A type that both applications need belongs in `shared`. Rendering code belongs
in `mmp`. Nothing in `shared` may import from `mmp`, since the backend loads
`shared` without a DOM.
