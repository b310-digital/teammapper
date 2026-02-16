# 📜 Rules

> Living rulebook for the TeamMapper autonomous agent team.
> All roles MUST follow these rules.

---

## R-001: Memory Bank Protocol

**Every heartbeat cycle MUST:**

1. **Read** `agents/memory/bank.md` before taking action
2. **Update** the relevant section after acting
3. **Never delete** another role's state — only update your own
4. **Timestamp** updates at the top

---

## R-002: Commit Standards

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

- **Types:** feat, fix, refactor, docs, test, ci, chore
- **Scopes:** backend, frontend, agents, docs
- **Mood:** Imperative ("add" not "added")
- **Footer:** Reference issues (`Closes #N`, `Relates to #N`)

---

## R-003: Branch Strategy

- `main` — Production-ready, protected
- `feat/<name>` — Features
- `fix/<name>` — Bug fixes
- `docs/<name>` — Documentation

**All PRs target `main`.**

---

## R-004: PR Requirements

Every PR MUST have:

- Clear title following conventional commits
- Description explaining what and why
- Tests for code changes
- Issue reference if applicable

---

## R-005: TypeScript Standards

- Strict mode enabled
- No `any` types without justification
- Explicit return types for functions
- Follow existing code patterns
