import { BadGatewayException, Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { LOGO_PNG } from '../../test/imageFixtures'
import {
  captureEnv,
  chunkedImageReply,
  closedHost,
  imageReply,
  jsonReply,
  logoBytes,
  PictogramUpstream,
  pointEnvAt,
  redirectReply,
  silentReply,
} from '../../test/pictogramUpstream'
import {
  PICTOGRAM_FETCH_TIMEOUT_MS,
  PictogramsService,
} from './pictograms.service'

const ONE_MIB = 1024 * 1024

/** Builds the service with the given upstream timeout. */
const createService = async (timeoutMs: number): Promise<PictogramsService> => {
  const module = await Test.createTestingModule({
    providers: [
      PictogramsService,
      { provide: PICTOGRAM_FETCH_TIMEOUT_MS, useValue: timeoutMs },
    ],
  }).compile()
  return module.get(PictogramsService)
}

describe('PictogramsService', () => {
  const upstream = new PictogramUpstream()
  const restoreEnv = captureEnv()
  let service: PictogramsService

  beforeAll(async () => {
    Logger.overrideLogger(false)
    await upstream.start()
  })

  afterAll(async () => {
    await upstream.stop()
    restoreEnv()
  })

  beforeEach(async () => {
    upstream.reset()
    pointEnvAt(upstream.host)
    service = await createService(2000)
  })

  describe('searchPictograms', () => {
    it('requests the search path of the language and term from the API base', async () => {
      upstream.handler = jsonReply(200, '[]')

      await service.searchPictograms('de', 'haus')

      expect(upstream.hits.map((hit) => hit.url)).toEqual([
        '/api/pictograms/de/search/haus',
      ])
    })

    it('encodes a term with a slash and a space in the upstream path', async () => {
      upstream.handler = jsonReply(200, '[]')

      await service.searchPictograms('en', 'a/b c')

      expect(upstream.hits.map((hit) => hit.url)).toEqual([
        '/api/pictograms/en/search/a%2Fb%20c',
      ])
    })

    it('returns the items reduced to their _id', async () => {
      const body = JSON.stringify([
        { _id: 6009, keywords: [{ keyword: 'dog' }] },
      ])
      upstream.handler = jsonReply(200, body)

      const result = await service.searchPictograms('en', 'dog')

      expect(result).toEqual([{ _id: 6009 }])
    })

    it('returns an empty list when ARASAAC answers 404', async () => {
      upstream.handler = jsonReply(404, '[]')

      const result = await service.searchPictograms('en', 'zzzz')

      expect(result).toEqual([])
    })

    it.each<[string, number, string]>([
      ['a 500 status', 500, '[]'],
      ['invalid JSON', 200, '{not json'],
      ['a body that is not an array', 200, '{"_id":1}'],
      ['an item without _id', 200, '[{"keywords":[]}]'],
      ['a fractional _id', 200, '[{"_id":1.5}]'],
    ])('rejects with BadGateway on %s', async (_name, status, body) => {
      upstream.handler = jsonReply(status, body)

      await expect(
        service.searchPictograms('en', 'dog')
      ).rejects.toBeInstanceOf(BadGatewayException)
    })

    it('rejects with BadGateway when ARASAAC redirects', async () => {
      upstream.handler = redirectReply('/elsewhere')

      await expect(
        service.searchPictograms('en', 'dog')
      ).rejects.toBeInstanceOf(BadGatewayException)
    })

    it('rejects with BadGateway when the connection fails', async () => {
      pointEnvAt(await closedHost())

      await expect(
        service.searchPictograms('en', 'dog')
      ).rejects.toBeInstanceOf(BadGatewayException)
    })

    it('rejects with BadGateway when ARASAAC does not answer within the timeout', async () => {
      upstream.handler = silentReply
      const impatient = await createService(100)

      await expect(
        impatient.searchPictograms('en', 'dog')
      ).rejects.toBeInstanceOf(BadGatewayException)
    })
  })

  describe('fetchPictogramImage', () => {
    it('requests the 300 pixel image path from the images base', async () => {
      upstream.handler = imageReply(LOGO_PNG)

      await service.fetchPictogramImage(2)

      expect(upstream.hits.map((hit) => hit.url)).toEqual([
        '/images/pictograms/2/2_300.png',
      ])
    })

    it('joins a base with a trailing slash without doubling the slash', async () => {
      process.env.PICTOGRAM_IMAGES_URL = `http://${upstream.host}/images/`
      upstream.handler = imageReply(LOGO_PNG)

      await service.fetchPictogramImage(2)

      expect(upstream.hits.map((hit) => hit.url)).toEqual([
        '/images/pictograms/2/2_300.png',
      ])
    })

    it('returns the bytes ARASAAC sent', async () => {
      upstream.handler = imageReply(LOGO_PNG)

      const result = await service.fetchPictogramImage(2)

      expect(result?.equals(LOGO_PNG)).toBe(true)
    })

    it('returns the bytes of an image of exactly 1 MiB', async () => {
      const exact = logoBytes(ONE_MIB)
      upstream.handler = imageReply(exact)

      const result = await service.fetchPictogramImage(2)

      expect(result?.equals(exact)).toBe(true)
    })

    it('accepts a content type with a parameter after image/png', async () => {
      upstream.handler = imageReply(LOGO_PNG, 'image/png; charset=binary')

      const result = await service.fetchPictogramImage(2)

      expect(result?.equals(LOGO_PNG)).toBe(true)
    })

    it('returns null when ARASAAC answers 404', async () => {
      upstream.handler = jsonReply(404, '{}')

      const result = await service.fetchPictogramImage(2)

      expect(result).toBeNull()
    })

    it('rejects with BadGateway on a content type other than image/png', async () => {
      upstream.handler = imageReply(LOGO_PNG, 'image/svg+xml')

      await expect(service.fetchPictogramImage(2)).rejects.toBeInstanceOf(
        BadGatewayException
      )
    })

    it('rejects with BadGateway when the content-length header exceeds 1 MiB', async () => {
      upstream.handler = imageReply(logoBytes(ONE_MIB + 1))

      await expect(service.fetchPictogramImage(2)).rejects.toBeInstanceOf(
        BadGatewayException
      )
    })

    it('rejects with BadGateway when a streamed body without content-length passes 1 MiB', async () => {
      upstream.handler = chunkedImageReply(logoBytes(ONE_MIB + 1))

      await expect(service.fetchPictogramImage(2)).rejects.toBeInstanceOf(
        BadGatewayException
      )
    })
  })
})
