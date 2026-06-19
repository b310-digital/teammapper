# pnpm Security Policy

This repo applies a subset of the [bodadotsh npm security best practices](https://github.com/bodadotsh/npm-security-best-practices) that fit a private-app monorepo distributed as a Docker image.

## What's enforced

| Practice | Where | Why |
|----------|-------|-----|
| Exact-version saves | `.npmrc` (`save-exact=true`) | New `pnpm add` calls write exact versions, keeping the manifest aligned with what the lockfile already pins. |
| Lifecycle scripts gated by allowlist | `pnpm-workspace.yaml` (`allowBuilds:` + `strictDepBuilds: true`) | pnpm 10 disables install scripts by default for transitive deps. `allowBuilds` is the explicit allowlist for the few packages (currently `@parcel/watcher` and `esbuild`) whose native builds we trust. `strictDepBuilds: true` makes an unreviewed build script fail the install (non-zero exit) instead of only printing a warning, so a new dependency lifecycle script is a hard CI gate. |
| 7-day quarantine on new versions | `pnpm-workspace.yaml` (`minimumReleaseAge: 10080`) | New package versions are held back from installation for 7 days, giving the ecosystem time to revoke compromised releases. If a specific package needs an exemption, add it to `minimumReleaseAgeExclude:`. |
| Frozen-lockfile installs | All CI workflows, the Dockerfile, and the `teammapper-frontend` `build:packages` script | Keeps the lockfile authoritative across every install path. |
| pnpm patch version pinned in CI | `corepack prepare pnpm@10.33.4 --activate` in all CI jobs | Matches the Dockerfile's `PNPM_VERSION` so CI and production builds use the same pnpm. |
| `pnpm audit` in CI | `teammapper-audit` job in `ci.yml` | Fails CI on high or critical advisories in production dependencies. |
| Transitive-dep CVE pins | `overrides:` in `pnpm-workspace.yaml` | Forces minimum versions of known-vulnerable transitive deps. Audit periodically with `pnpm why <pkg>` and retire entries once the tree resolves above the vulnerable range. |
| Action pinning | All `uses:` lines in `.github/workflows/` carry a 40-char SHA | Protects against tag-rewrite supply-chain attacks. |
| Least-privilege workflow permissions | Workflow-level `permissions: contents: read`, with per-job overrides only where a job needs more | CI runs with `secrets.GITHUB_TOKEN` scoped to the minimum each job requires. |
| No Dependabot PRs — uniform 7-day quarantine | `open-pull-requests-limit: 0` (all ecosystems) in `.github/dependabot.yml` **+** security updates disabled in repo settings (see below) | Both version and security updates are off. Security PRs are immediate — `cooldown` does not apply to them — and would bypass the quarantine, so every change is applied by hand under `minimumReleaseAge`. Alerts stay on for triage. |
| Node base image pinned by digest, bumped manually | `FROM node:…@sha256:…` in `Dockerfile` | The base image is pinned to a multi-arch manifest digest so builds are reproducible and immune to tag re-publishing. Bumps follow the Node LTS release cycle and are applied by hand, re-resolving the digest with `docker buildx imagetools inspect node:<version>-alpine<alpine>`. With version updates disabled, Dependabot never proposes a Node image bump. |
| Dependency review on every PR | `dependency-review` job in `ci.yml` (`actions/dependency-review-action`) | Fails the PR if it introduces a new dep with a high/critical advisory or a license outside the allow-list (MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0, Zlib, CC-BY-4.0). Complements `pnpm audit`, which only checks the installed tree. |

## Dependabot setup (repo settings)

Dependabot can't delay security PRs — `cooldown` applies to version updates only
([#13979](https://github.com/dependabot/dependabot-core/issues/13979)) — so the
7-day quarantine is kept airtight by turning PRs off and patching by hand:

- **Version updates** — disabled via `open-pull-requests-limit: 0` in `.github/dependabot.yml`.
- **Security updates** — Settings → Code security → "Dependabot security updates" → **Disabled** (no `dependabot.yml` field for this).
- **Alerts** — keep enabled; optionally add an auto-triage rule to dismiss sub-`high` alerts. Patch high/critical by hand once the fix is ≥7 days old (see "Adding a new override").

## Running checks locally

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level=high --prod   # match the CI gate
pnpm run lint && pnpm run tsc && pnpm run test
```

## Adding a new override

1. Confirm the CVE via `pnpm audit` or the advisory link.
2. Identify the affected version range, e.g. `lodash@<4.18.0`.
3. Add the entry to `overrides:` in `pnpm-workspace.yaml` with the patched version, e.g. `'lodash@<4.18.0': '>=4.18.0'`.
4. Run `pnpm install` to refresh the lockfile, then commit both files.
5. Once `pnpm why <pkg>` shows the tree resolves above the vulnerable range, retire the override.
