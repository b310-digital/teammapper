import { LogThrottle } from './logThrottle'

describe('LogThrottle', () => {
  let time: number
  let throttle: LogThrottle

  beforeEach(() => {
    time = 1_000_000
    throttle = new LogThrottle(60_000, () => time)
  })

  it('admits the first call for a key with no suppressed repeats', () => {
    expect(throttle.admit('a')).toBe(0)
  })

  it('suppresses repeats inside the window', () => {
    throttle.admit('a')
    time += 59_999

    expect(throttle.admit('a')).toBeNull()
  })

  it('reports the suppressed count on the first call after the window', () => {
    throttle.admit('a')
    for (let i = 0; i < 49; i++) throttle.admit('a')
    time += 60_001

    expect(throttle.admit('a')).toBe(49)
  })

  it('opens a new window after it reports the count', () => {
    throttle.admit('a')
    time += 60_001
    throttle.admit('a')

    expect(throttle.admit('a')).toBeNull()
  })

  it('opens a new window at exactly the window length', () => {
    throttle.admit('a')
    time += 60_000

    expect(throttle.admit('a')).toBe(0)
  })

  it('keeps keys independent', () => {
    throttle.admit('map1:mapTooLarge')

    expect(throttle.admit('map1:rateLimited')).toBe(0)
    expect(throttle.admit('map2:mapTooLarge')).toBe(0)
    expect(throttle.admit('map1:mapTooLarge')).toBeNull()
  })

  it('forgets a key whose window ended after prune', () => {
    throttle.admit('a')
    throttle.admit('a')
    time += 60_000
    throttle.prune()

    expect(throttle.admit('a')).toBe(0)
  })

  it('keeps an open window and its count after prune', () => {
    throttle.admit('a')
    throttle.admit('a')
    time += 30_000
    throttle.prune()

    expect(throttle.admit('a')).toBeNull()
    time += 30_000
    expect(throttle.admit('a')).toBe(2)
  })
})
