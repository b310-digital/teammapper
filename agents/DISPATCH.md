# 🏭 Agent Dispatch Protocol

You are orchestrating the autonomous development team for **TeamMapper**.

**Repo root:** This file lives at `agents/DISPATCH.md` in the TeamMapper monorepo.

---

## Heartbeat Cycle (execute in order)

### Phase 1: Context Load

Before starting, load your context:

```bash
# Check rotation state and recent history
cat agents/state/rotation.json

# View memory bank
cat agents/memory/bank.md
```

Also read:

- `agents/roster.json` → rotation order and roles
- `agents/rules/RULES.md` → mandatory rules
- `agents/playbooks/<your-role>.md` → your playbook

### Phase 2: Situational Awareness

```bash
# Check open issues
gh issue list --state open --limit 50

# Check open PRs
gh pr list --limit 20
```

Cross-reference with memory bank:

- What's changed since last cycle?
- What's the highest-impact action for your role?
- Are there blockers or dependencies?

### Phase 3: Execute

1. Pick **ONE** action from your role's playbook
2. Execute it via GitHub (create issue, write code + PR, add docs, comment)
3. All work branches from `main`, PRs target `main`

### Phase 4: Memory Update

Update `agents/memory/bank.md`:

- `Current Status` → what changed
- `Role State` → your role's section (last action, working on)
- `Active Threads` → if dependencies changed

### Phase 5: Complete

After acting:

1. Update `agents/state/rotation.json` (advance index, increment cycle, add history entry)
2. Commit changes: `chore(agents): cycle N — <brief action>`
3. Push to main

---

## Monorepo Context

This is a pnpm workspaces monorepo:

- `teammapper-backend/` — NestJS backend API
- `teammapper-frontend/` — Frontend application
- `docs/` — Documentation
- `agents/` — Autonomous agent team (this directory)

## Rotation

Order: defined in `roster.json → rotation_order`

Current position: `rotation.json.current_index` maps to `roster.json.rotation_order`

## Rules

**All rules in `agents/rules/RULES.md` are mandatory.**

### Commits

- Conventional commits: `<type>(<scope>): <description>`
- Types: feat, fix, refactor, docs, test, ci, chore
- Scopes: backend, frontend, agents, docs
- Imperative mood, reference issues

### Branches

- Features: `feat/<short-name>`, Fixes: `fix/<short-name>`, Docs: `docs/<short-name>`
- All branch from `main`, PR back to `main`

### Memory Bank

- Read before acting, update after acting
- Never delete another role's state

## State Files

```
agents/
├── DISPATCH.md              ← You are here
├── roster.json              ← Team composition + rotation order
├── state/
│   └── rotation.json        ← Current rotation state
├── memory/
│   └── bank.md              ← Shared memory (READ + UPDATE every cycle)
├── rules/
│   └── RULES.md             ← Master rules (MANDATORY)
└── playbooks/
    ├── engineering.md
    ├── qa.md
    └── docs.md
```
