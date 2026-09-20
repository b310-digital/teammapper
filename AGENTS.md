# Agents

This file holds rules for working in this repository. Never use it as a
changelog: git history already records what changed. Every entry states a rule
you have to follow, or a fact you need in order to follow one. Delete an entry
when it stops being true instead of appending a note that supersedes it.

Keep environment-specific setup out of this file. Container names, addresses,
ports, cache directories and endpoints belong in `docker-compose.yml`, the
README, or a gitignored config.

## E2E tests

The suite in `teammapper-frontend/e2e` drives a browser in the `playwright`
container, because the `app` container installs none. Two variables on the `app`
service in `docker-compose.yml` wire that up, and
`teammapper-frontend/playwright.config.ts` reads both:

- `TESTING_PLAYWRIGHT_WS_ENDPOINT` makes the config pass `connectOptions`.
  Without it Playwright launches a browser inside the `app` container and every
  test fails with a missing executable. Do not answer that failure with
  `npx playwright install`: no browser belongs in the `app` container.
- `TESTING_PLAYWRIGHT_BASE_URL` sets `baseURL`. Without it the fallback is
  `http://localhost:4200`, which inside the `playwright` container is the
  browser's own loopback, where nothing listens.

Run the suite with `pnpm run test:e2e`. The config declares the backend and the
frontend as `webServer` entries with `reuseExistingServer`, so it adopts servers
already listening on 3000 and 4200 and starts nothing.

`webkit` is the only project. Chrome forces a redirect to https and cannot run
the suite.

`@playwright/test` in `teammapper-frontend/package.json` and the
`mcr.microsoft.com/playwright:vX.Y.Z-noble` tag in `docker-compose.yml` must
match, because the protocol between them is not stable across versions. Bump
both in the same commit.

## Formatting and lint scope

`.prettierrc` at the repository root is the one prettier config, and every
workspace inherits it. `teammapper-backend/.prettierrc.json` is the only
override, and exists because the backend writes no semicolons. Do not add a
third: prettier applies the nearest file and ignores the rest, so a copy forks
the rules without anyone noticing.

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

`teammapper-frontend/tsconfig.json` sets `strict: true` and turns
`strictPropertyInitialization` back off. Angular checks templates with
`strictTemplates`, `strictInjectionParameters` and `strictInputAccessModifiers`.

Follow five rules:

1. Write class fields that pass once `strictPropertyInitialization` is on:
   initialize them, or declare them `T | null` and assign later.
2. Never silence a type error with `!` or `as any`. A non-null assertion moves
   the failure to runtime. Narrow the value, or change the type so the null case
   is representable.
3. For a value that is missing only until setup runs, write one accessor that
   throws (see `MmpService.map` and `YjsSyncService.doc`) instead of spreading
   `?.` across every use.
4. Narrow with `error instanceof Error` before reading `.message`; `catch` binds
   `unknown`.
5. Put the datum on the d3 selection, as in
   `d3.selectAll<SVGPathElement, Node>(...)`. `strictFunctionTypes` rejects an
   annotation on the callback parameter.

Two commands check this:

1. `pnpm --filter teammapper-frontend run tsc` checks the TypeScript.
2. `pnpm --filter teammapper-frontend run build:dev` checks the templates, which
   `tsc` skips.

## Types and imports

`packages/shared` owns every type that crosses the wire, so import those from
`@teammapper/shared`. Before writing an interface, search the shared package for
one that already describes the payload. A payload typed in two places drifts,
and the copies then disagree about what the server sends.

Derive a variant instead of retyping the fields. `Required<T>` makes every
optional field of `T` mandatory, which is how `UserMapOptions` stays tied to
`MapOptions`. `Required<T>` leaves a declared `| null` alone, so for the node
styling types, whose schemas mark every field `v.nullable`, derive with
`Resolved<T>` instead (see `MapNodeColors`).

Import from the module that declares the symbol. Never re-export one module's
types from another, and never add a barrel file whose only content is a chain of
re-export statements. A re-export hides where a type comes from and gives one
type two import paths, so both end up in use. `packages/shared/src/index.ts` is
the package entry point and the only exception.
