import { Test } from '@nestjs/testing'
import { PayloadTooLargeException } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ThrottlerModule } from '@nestjs/throttler'
import request from 'supertest'
import { MODIFICATION_SECRET_HEADER } from '@teammapper/shared'
import ImagesController from './images.controller'
import { MapsService } from '../services/maps.service'
import { ImagesService } from '../services/images.service'
import { createMmpMap } from '../utils/tests/mapFactories'
import { GlobalExceptionFilter } from '../../filters/global-exception.filter'
import { LOGO_PNG } from '../../../test/imageFixtures'

const IMAGE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

// Each test posts from its own IP, so the rate limit of one test does not
// leak into the next.
let lastIp = 0
const nextIp = (): string => `10.0.0.${++lastIp}`

describe('ImagesController (HTTP)', () => {
  let app: NestExpressApplication
  const map = createMmpMap({ modificationSecret: 'secret' })
  const mapsService = { findMap: jest.fn() }
  const imagesService = { storeImage: jest.fn(), readImage: jest.fn() }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
      controllers: [ImagesController],
      providers: [
        { provide: MapsService, useValue: mapsService },
        { provide: ImagesService, useValue: imagesService },
      ],
    }).compile()

    app = module.createNestApplication<NestExpressApplication>()
    app.useGlobalFilters(new GlobalExceptionFilter())
    app.set('trust proxy', true)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.resetAllMocks()
    mapsService.findMap.mockResolvedValue(map)
    imagesService.storeImage.mockResolvedValue(`image:${IMAGE_ID}`)
  })

  const upload = (ip = nextIp(), mapId = map.id) =>
    request(app.getHttpServer())
      .post(`/api/maps/${mapId}/images`)
      .set('X-Forwarded-For', ip)

  describe('POST /api/maps/:id/images', () => {
    it('stores a PNG posted with the secret and answers 201 with the reference', async () => {
      const response = await upload()
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(201)

      expect(response.body).toEqual({ reference: `image:${IMAGE_ID}` })
      expect(imagesService.storeImage).toHaveBeenCalledWith(
        map.id,
        expect.objectContaining({
          mimetype: 'image/png',
          size: LOGO_PNG.length,
        })
      )
    })

    it.each([
      ['without a secret', undefined],
      ['with a wrong secret', 'wrong'],
    ])('answers 403 %s', async (_label, secret) => {
      const req = upload()
      if (secret) req.set(MODIFICATION_SECRET_HEADER, secret)
      await req
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(403)

      expect(imagesService.storeImage).not.toHaveBeenCalled()
    })

    it('answers 403 for the secret in Authorization only', async () => {
      await upload()
        .set('Authorization', 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(403)

      expect(imagesService.storeImage).not.toHaveBeenCalled()
    })

    it('stores the image when basic auth fills Authorization', async () => {
      await upload()
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(201)
    })

    it('answers 422 for an SVG file', async () => {
      await upload()
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach(
          'file',
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
          {
            filename: 'a.svg',
            contentType: 'image/svg+xml',
          }
        )
        .expect(422)

      expect(imagesService.storeImage).not.toHaveBeenCalled()
    })

    it('answers 422 for a file declared as PNG whose bytes are no image', async () => {
      await upload()
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', Buffer.from('not an image at all'), {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(422)

      expect(imagesService.storeImage).not.toHaveBeenCalled()
    })

    it('answers 422 for PNG bytes declared as SVG', async () => {
      await upload()
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.svg',
          contentType: 'image/svg+xml',
        })
        .expect(422)
    })

    it('answers 422 without a file', async () => {
      await upload().set(MODIFICATION_SECRET_HEADER, 'secret').expect(422)
    })

    it('answers 413 for a file larger than UPLOAD_IMAGE_MAX_SIZE_BYTES', async () => {
      await upload()
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        // The logo, padded with zero bytes past the limit.
        .attach('file', Buffer.concat([LOGO_PNG, Buffer.alloc(150_001)]), {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(413)

      expect(imagesService.storeImage).not.toHaveBeenCalled()
    })

    it.each([
      ['before', true],
      ['after', false],
    ])(
      'answers 400 for a text field %s the file',
      async (_label, fieldFirst) => {
        const req = upload().set(MODIFICATION_SECRET_HEADER, 'secret')
        if (fieldFirst) req.field('note', 'x')
        req.attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        if (!fieldFirst) req.field('note', 'x')
        await req.expect(400)

        expect(imagesService.storeImage).not.toHaveBeenCalled()
      }
    )

    it('answers 413 when the upload exceeds the map cap', async () => {
      imagesService.storeImage.mockRejectedValueOnce(
        new PayloadTooLargeException()
      )

      await upload()
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(413)
    })

    it('answers 404 for a map that does not exist', async () => {
      mapsService.findMap.mockResolvedValueOnce(null)

      await upload(nextIp(), '00000000-0000-4000-8000-000000000000')
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(404)
    })

    it('answers 404 for a map id that is not a uuid', async () => {
      await upload(nextIp(), 'not-a-uuid')
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(404)

      expect(mapsService.findMap).not.toHaveBeenCalled()
    })

    it('answers 429 above 30 uploads per window, and still serves another IP', async () => {
      const ip = nextIp()
      for (let i = 0; i < 30; i++) {
        await upload(ip)
          .set(MODIFICATION_SECRET_HEADER, 'secret')
          .attach('file', LOGO_PNG, {
            filename: 'a.png',
            contentType: 'image/png',
          })
          .expect(201)
      }

      await upload(ip)
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(429)
      await upload()
        .set(MODIFICATION_SECRET_HEADER, 'secret')
        .attach('file', LOGO_PNG, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(201)
    })
  })

  describe('GET /api/maps/:id/images/:imageId', () => {
    it('answers 200 with the bytes, the type and the cache headers, without a secret', async () => {
      const data = LOGO_PNG
      imagesService.readImage.mockResolvedValueOnce({
        data,
        mimetype: 'image/png',
        size: data.length,
      })

      const response = await request(app.getHttpServer())
        .get(`/api/maps/${map.id}/images/${IMAGE_ID}`)
        .expect(200)

      expect(response.headers['content-type']).toBe('image/png')
      expect(response.headers['content-length']).toBe(String(data.length))
      expect(response.headers['content-disposition']).toMatch(/^inline/)
      expect(response.headers['cache-control']).toContain('immutable')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(Buffer.compare(response.body, data)).toBe(0)
    })

    it('answers 404 for an image the map does not hold', async () => {
      imagesService.readImage.mockResolvedValueOnce(null)

      await request(app.getHttpServer())
        .get(`/api/maps/${map.id}/images/${IMAGE_ID}`)
        .expect(404)
    })

    it('answers 404 for a map id that is not a uuid', async () => {
      await request(app.getHttpServer())
        .get(`/api/maps/not-a-uuid/images/${IMAGE_ID}`)
        .expect(404)

      expect(imagesService.readImage).not.toHaveBeenCalled()
    })
  })
})
