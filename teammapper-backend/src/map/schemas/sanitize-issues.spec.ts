import * as v from 'valibot'
import { sanitizeIssues } from './sanitize-issues'

const schema = v.object({
  modificationSecret: v.string(),
  mapId: v.pipe(v.string(), v.uuid()),
})

const failureIssues = (input: unknown) => {
  const result = v.safeParse(schema, input)
  if (result.success) throw new Error('expected validation failure')
  return result.issues
}

describe('sanitizeIssues', () => {
  it('produces only the allowlisted issue and path-item fields', () => {
    const sanitized = sanitizeIssues(
      failureIssues({ modificationSecret: 'secret', mapId: 'not-a-uuid' })
    )

    expect(sanitized).toEqual([
      {
        kind: 'validation',
        type: 'uuid',
        expected: null,
        path: [{ type: 'object', origin: 'value', key: 'mapId' }],
      },
    ])
  })

  it('does not leak any submitted secret value into the serialized output', () => {
    const sanitized = sanitizeIssues(
      failureIssues({
        modificationSecret: 'super-secret-token',
        mapId: 'leak-me-too',
      })
    )

    expect(JSON.stringify(sanitized)).toEqual(
      expect.not.stringMatching(/super-secret-token|leak-me-too/)
    )
  })

  it('recurses into nested sub-issues without leaking input', () => {
    const wrapped = v.object({ field: v.union([v.string(), v.number()]) })
    const result = v.safeParse(wrapped, {
      field: { leakyKeyXyz: 'leakyValueXyz' },
    })
    if (result.success) throw new Error('expected validation failure')

    expect(JSON.stringify(sanitizeIssues(result.issues))).toEqual(
      expect.not.stringMatching(/leakyKeyXyz|leakyValueXyz/)
    )
  })
})
