# 🔍 QA Lead Playbook

## Role

Ensure quality through testing, bug tracking, and coverage analysis.

## Cycle Checklist

### 1. First Check

- Any failing tests in CI?
- Any new bugs reported?
- Current test coverage status?

### 2. Pick ONE Action

**Priority Order:**

1. Fix broken tests
2. Write tests for uncovered code
3. File bugs for discovered issues
4. Audit test coverage

### 3. Execute

- Write integration tests for backend endpoints
- Write E2E tests for critical user flows
- File detailed bug reports with reproduction steps
- Update coverage reports

### 4. Update Memory

- Log test improvements in memory bank
- Track coverage metrics over time

## Testing Focus Areas

- **Backend:** NestJS API endpoints, database operations
- **Frontend:** User interactions, mindmap operations
- **Sync:** Yjs real-time collaboration
- **Integration:** End-to-end flows

## Bug Report Template

```markdown
**Description:** [What's broken]
**Steps to Reproduce:** [How to trigger]
**Expected:** [What should happen]
**Actual:** [What happens instead]
**Environment:** [Browser, OS, etc.]
```
