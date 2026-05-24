import type { BaseIssue, IssuePathItem } from 'valibot'

type AnyIssue = BaseIssue<unknown>

export interface SanitizedIssuePathItem {
  type: IssuePathItem['type']
  origin: IssuePathItem['origin']
  key: IssuePathItem['key']
}

export interface SanitizedIssue {
  kind: AnyIssue['kind']
  type: AnyIssue['type']
  expected: AnyIssue['expected']
  path?: SanitizedIssuePathItem[]
  issues?: SanitizedIssue[]
}

/**
 * Strip raw user input from valibot issues so secrets bound on sibling fields
 * (e.g. `adminId`, `modificationSecret`) cannot land in error responses or logs.
 * Removes:
 *  - `input` and `received` on each issue (both can contain literal user values)
 *  - `message` (valibot bakes the received value into default messages, e.g.
 *    `Invalid UUID: Received "<raw>"`)
 *  - `requirement` (often a RegExp / unstructured constraint, not stable for clients)
 *  - `input` and `value` on each `path` item (echoes the surrounding object)
 * Applied recursively to nested `issues`. Clients can render localized messages
 * from `kind`, `type`, `expected`, and `path`.
 */
export const sanitizeIssues = (issues: readonly AnyIssue[]): SanitizedIssue[] =>
  issues.map(sanitizeIssue)

const sanitizeIssue = (issue: AnyIssue): SanitizedIssue => {
  const sanitized: SanitizedIssue = {
    kind: issue.kind,
    type: issue.type,
    expected: issue.expected,
  }
  if (issue.path) sanitized.path = issue.path.map(sanitizePathItem)
  if (issue.issues) sanitized.issues = issue.issues.map(sanitizeIssue)
  return sanitized
}

const sanitizePathItem = (item: IssuePathItem): SanitizedIssuePathItem => ({
  type: item.type,
  origin: item.origin,
  key: item.key,
})
