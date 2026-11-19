import { BadRequestException, INestApplication, Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { LOGO_PNG } from '../../test/imageFixtures'
import {
  captureEnv,
  imageReply,
  jsonReply,
  PictogramUpstream,
  pointEnvAt,
} from '../../test/pictogramUpstream'
import { SettingsService } from '../settings/settings.service'
import { PictogramsController } from './pictograms.controller'
import { PictogramsModule } from './pictograms.module'
import { PICTOGRAM_FETCH_TIMEOUT_MS } from './pictograms.service'

const SEARCH = '/arasaac/api/pictograms'
const IMAGE = '/arasaac/images/pictograms'

describe('PictogramsController', () => {
  const upstream = new PictogramUpstream()
  const restoreEnv = captureEnv()
  const settings = { pictograms: true }
  let app: INestApplication

  beforeAll(async () => {
    Logger.overrideLogger(false)
    await upstream.start()
    const module = await Test.createTestingModule({
      imports: [PictogramsModule],
    })
      .overrideProvider(SettingsService)
      .useValue({
        getSettings: () => ({
          systemSettings: { featureFlags: { pictograms: settings.pictograms } },
        }),
      })
      .overrideProvider(PICTOGRAM_FETCH_TIMEOUT_MS)
      .useValue(2000)
      .compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await upstream.stop()
    restoreEnv()
  })

  beforeEach(() => {
    upstream.reset()
    pointEnvAt(upstream.host)
    settings.pictograms = true
  })

  const get = (path: string) => request(app.getHttpServer()).get(path)
  const hitUrls = () => upstream.hits.map((hit) => hit.url)

  describe('with the pictograms flag off', () => {
    beforeEach(() => {
      settings.pictograms = false
      upstream.handler = jsonReply(200, '[{"_id":1}]')
    })

    it.each([
      ['search', `${SEARCH}/de/search/haus`],
      ['search with an invalid language', `${SEARCH}/xx/search/haus`],
      ['image', `${IMAGE}/2/2_300.png`],
    ])('answers 404 and calls no upstream for %s', async (_name, path) => {
      await get(path).expect(404)

      expect(upstream.hits).toEqual([])
    })
  })

  describe('search', () => {
    it('answers 200 with the pictograms reduced to their _id', async () => {
      upstream.handler = jsonReply(200, '[{"_id":6009,"keywords":[]}]')

      const response = await get(`${SEARCH}/en/search/dog`).expect(200)

      expect(response.body).toEqual([{ _id: 6009 }])
    })

    it('asks ARASAAC for the trimmed term', async () => {
      upstream.handler = jsonReply(200, '[]')

      await get(`${SEARCH}/de/search/%20haus%20`).expect(200)

      expect(hitUrls()).toEqual(['/api/pictograms/de/search/haus'])
    })

    it('asks ARASAAC for an encoded term when the term contains a slash', async () => {
      upstream.handler = jsonReply(200, '[]')

      await get(`${SEARCH}/de/search/a%2Fb`).expect(200)

      expect(hitUrls()).toEqual(['/api/pictograms/de/search/a%2Fb'])
    })

    it('accepts a term of exactly 100 characters', async () => {
      upstream.handler = jsonReply(200, '[]')

      await get(`${SEARCH}/de/search/${'a'.repeat(100)}`).expect(200)
    })

    it.each([
      ['an unsupported language', `${SEARCH}/xx/search/haus`],
      ['a blank term', `${SEARCH}/de/search/%20%20`],
      ['a term of 101 characters', `${SEARCH}/de/search/${'a'.repeat(101)}`],
      ['a term of three dots', `${SEARCH}/de/search/...`],
    ])('answers 400 and calls no upstream for %s', async (_name, path) => {
      await get(path).expect(400)

      expect(upstream.hits).toEqual([])
    })

    // The HTTP client resolves ".." as a path segment before the request
    // leaves, so this term reaches the handler only by a direct call.
    it('rejects the term ".." and calls no upstream', async () => {
      const controller = app.get(PictogramsController)

      await expect(controller.search('de', '..')).rejects.toBeInstanceOf(
        BadRequestException
      )

      expect(upstream.hits).toEqual([])
    })

    it('answers 502 when ARASAAC fails', async () => {
      upstream.handler = jsonReply(500, '[]')

      await get(`${SEARCH}/en/search/dog`).expect(502)
    })
  })

  describe('image', () => {
    it('answers 200 with the bytes and the caching headers', async () => {
      upstream.handler = imageReply(LOGO_PNG)

      const response = await get(`${IMAGE}/2/2_300.png`).expect(200)

      expect(Buffer.from(response.body).equals(LOGO_PNG)).toBe(true)
      expect(response.headers).toMatchObject({
        'content-type': 'image/png',
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
      })
    })

    it('answers 404 when ARASAAC answers 404', async () => {
      upstream.handler = jsonReply(404, '{}')

      await get(`${IMAGE}/2/2_300.png`).expect(404)
    })

    it.each([
      ['an id that is not a number', `${IMAGE}/abc/abc_300.png`],
      ['a file named after another id', `${IMAGE}/1/2_300.png`],
      ['a file of another size', `${IMAGE}/1/1_500.png`],
      ['a file of another type', `${IMAGE}/1/1_300.svg`],
      ['an id of 10 digits', `${IMAGE}/1234567890/1234567890_300.png`],
    ])('answers 404 and calls no upstream for %s', async (_name, path) => {
      await get(path).expect(404)

      expect(upstream.hits).toEqual([])
    })
  })
})
