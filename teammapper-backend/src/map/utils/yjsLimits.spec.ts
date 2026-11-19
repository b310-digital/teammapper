import { DEFAULT_YJS_MAP_LIMITS, maxMessagePayload } from './yjsLimits'

describe('maxMessagePayload', () => {
  it('gives the default map size limit plus 64 KiB', () => {
    expect(maxMessagePayload(DEFAULT_YJS_MAP_LIMITS)).toBe(
      5 * 1024 * 1024 + 64 * 1024
    )
  })

  it('follows a configured map size limit', () => {
    expect(maxMessagePayload({ maxBytes: 65536 })).toBe(131072)
  })
})
