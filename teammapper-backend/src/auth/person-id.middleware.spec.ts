import jwt from 'jsonwebtoken'
import { PersonIdMiddleware } from './person-id.middleware'
import { Request } from '../map/types'

const SECRET = 'person-id-spec-secret'
const PID = 'person-id'

const sign = (payload: object, secret = SECRET) =>
  jwt.sign(payload, secret, { algorithm: 'HS256' })

/** A token with `alg: none`, which carries no signature at all. */
const unsigned = (payload: object) => {
  const encode = (part: object) =>
    Buffer.from(JSON.stringify(part)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

/** Runs the middleware on a request carrying the given cookie and returns the pid it set. */
const resolvePid = (cookie: unknown): string | undefined => {
  const req = { cookies: { person_id: cookie }, pid: 'stale' } as Request
  const next = jest.fn()
  new PersonIdMiddleware().use(req, new Response(), next)
  expect(next).toHaveBeenCalledTimes(1)
  return req.pid
}

describe('PersonIdMiddleware', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.JWT_SECRET
    process.env.JWT_SECRET = SECRET
    // The middleware warns on every rejected cookie, which these tests send on purpose.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env.JWT_SECRET = previousSecret
    jest.restoreAllMocks()
  })

  it('sets the pid from a validly signed cookie', () => {
    expect(resolvePid(sign({ pid: PID }))).toBe(PID)
  })

  it('leaves the pid unset without a cookie', () => {
    expect(resolvePid(undefined)).toBeUndefined()
  })

  it('leaves the pid unset when no secret is configured', () => {
    const token = sign({ pid: PID })
    delete process.env.JWT_SECRET
    expect(resolvePid(token)).toBeUndefined()
  })

  it.each(['null', 'undefined', '', PID])(
    'leaves the pid unset for the unsigned value %p',
    (value) => {
      expect(resolvePid(value)).toBeUndefined()
    }
  )

  // cookie-parser turns a `j:` prefixed cookie into the parsed JSON value.
  it.each([null, { pid: PID }, [PID]])(
    'leaves the pid unset for the JSON cookie %p',
    (value) => {
      expect(resolvePid(value)).toBeUndefined()
    }
  )

  it('rejects a token signed with another secret', () => {
    expect(resolvePid(sign({ pid: PID }, 'not-the-secret'))).toBeUndefined()
  })

  it('rejects an unsigned token with alg none', () => {
    expect(resolvePid(unsigned({ pid: PID }))).toBeUndefined()
  })

  it('rejects a valid signature over a swapped payload', () => {
    const [header, , signature] = sign({ pid: 'other' }).split('.')
    const payload = Buffer.from(JSON.stringify({ pid: PID })).toString(
      'base64url'
    )
    expect(resolvePid(`${header}.${payload}.${signature}`)).toBeUndefined()
  })

  it.each([
    ['null', { pid: null }],
    ['missing', {}],
    ['empty', { pid: '' }],
  ])('yields a falsy pid for a signed token whose pid is %s', (_, payload) => {
    expect(resolvePid(sign(payload))).toBeFalsy()
  })
})
