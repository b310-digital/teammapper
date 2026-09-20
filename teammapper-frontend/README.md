# TeamMapper frontend

## Description

Based on https://github.com/cedoor/mindmapp (discontinued)

## Setup

```
pnpm install

pnpm run start
```

## Dev

### Lint

```
pnpm exec prettier --write src
pnpm run lint -- --fix
```

### Type checking

```
pnpm run tsc        # TypeScript
pnpm run build:dev  # Angular templates, which tsc skips
```

The project compiles under `strict: true`. `strictNullChecks` and
`strictPropertyInitialization` stay off while we turn them on one area at a
time; `tsconfig.json` gives the reasoning. Until then, narrow values rather than
asserting with `!`, and mark what can be absent as `T | null` or optional.
