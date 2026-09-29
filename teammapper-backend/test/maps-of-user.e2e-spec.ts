import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { Repository } from 'typeorm'
import { MapModule } from '../src/map/map.module'
import { MmpMap } from '../src/map/entities/mmpMap.entity'
import { createTestConfiguration, destroyWorkerDatabase } from './db'

const workerId = process.env.JEST_WORKER_ID || ''
const SECRET = 'maps-of-user-e2e-secret'
const OWNER = 'owner-person-id'
const OTHER = 'other-person-id'

const sign = (payload: object, secret = SECRET) =>
  jwt.sign(payload, secret, { algorithm: 'HS256' })

/** A token with `alg: none`, which carries no signature at all. */
const unsigned = (payload: object) => {
  const encode = (part: object) =>
    Buffer.from(JSON.stringify(part)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

describe('GET /api/maps (e2e)', () => {
  let app: INestApplication
  let repo: Repository<MmpMap>
  let ownerMapId: string
  let previousSecret: string | undefined

  const listMaps = (cookie?: string) => {
    const req = request(app.getHttpServer()).get('/api/maps')
    return cookie === undefined ? req : req.set('Cookie', cookie)
  }

  const listedIds = async (cookie?: string): Promise<string[]> => {
    const response = await listMaps(cookie).expect(200)
    return (response.body as { uuid: string }[]).map((map) => map.uuid)
  }

  beforeAll(async () => {
    // The middleware warns on every rejected cookie, which these tests send on purpose.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    previousSecret = process.env.JWT_SECRET
    process.env.JWT_SECRET = SECRET

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(await createTestConfiguration(workerId)),
        MapModule,
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    repo = moduleRef.get<Repository<MmpMap>>(getRepositoryToken(MmpMap))
    const [ownerMap] = await repo.save([
      repo.create({ ownerExternalId: OWNER }),
      repo.create({ ownerExternalId: OTHER }),
      repo.create({ ownerExternalId: null }),
      repo.create({ ownerExternalId: null }),
    ])
    ownerMapId = ownerMap.id
  })

  afterAll(async () => {
    process.env.JWT_SECRET = previousSecret
    jest.restoreAllMocks()
    await destroyWorkerDatabase(repo.manager.connection, workerId)
    await app.close()
  })

  it('returns only the maps owned by the person in a valid cookie', async () => {
    expect(await listedIds(`person_id=${sign({ pid: OWNER })}`)).toEqual([
      ownerMapId,
    ])
  })

  it('returns no maps without a cookie', async () => {
    expect(await listedIds()).toEqual([])
  })

  it.each([
    'null',
    'undefined',
    '',
    'j:null',
    'j:{"pid":null}',
    `j:"${OWNER}"`,
  ])('returns no maps for the unsigned cookie value %p', async (value) => {
    expect(await listedIds(`person_id=${encodeURIComponent(value)}`)).toEqual(
      []
    )
  })

  it.each([
    ['pid is null', { pid: null }],
    ['pid is missing', {}],
    ['pid is empty', { pid: '' }],
    ['pid is the string "null"', { pid: 'null' }],
    ['pid is the string "undefined"', { pid: 'undefined' }],
  ])('returns no maps for a signed token where %s', async (_label, payload) => {
    expect(await listedIds(`person_id=${sign(payload)}`)).toEqual([])
  })

  it('rejects a token signed with another secret', async () => {
    const forged = sign({ pid: OWNER }, 'not-the-server-secret')
    expect(await listedIds(`person_id=${forged}`)).toEqual([])
  })

  it('rejects an unsigned token with alg none', async () => {
    expect(await listedIds(`person_id=${unsigned({ pid: OWNER })}`)).toEqual([])
  })

  it('rejects a valid token whose payload was swapped', async () => {
    const [header, , signature] = sign({ pid: OTHER }).split('.')
    const payload = Buffer.from(JSON.stringify({ pid: OWNER })).toString(
      'base64url'
    )
    expect(
      await listedIds(`person_id=${header}.${payload}.${signature}`)
    ).toEqual([])
  })

  it('ignores a pid passed as query parameter or header', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/maps?pid=${OWNER}&ownerExternalId=${OWNER}`)
      .set('pid', OWNER)
      .expect(200)
    expect(response.body).toEqual([])
  })
})
