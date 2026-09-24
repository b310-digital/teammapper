import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { PayloadTooLargeException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Repository } from 'typeorm'
import { imageIdOf, ImageReference } from '@teammapper/shared'
import AppModule from '../../app.module'
import {
  createTestConfiguration,
  destroyWorkerDatabase,
} from '../../../test/db'
import { truncateDatabase } from '../../../test/helper'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpImage } from '../entities/mmpImage.entity'
import { ImagesService, ImageUpload } from './images.service'

const pngUpload = (size = 64): ImageUpload => {
  const buffer = Buffer.alloc(size)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  return { buffer, mimetype: 'image/png', size }
}

describe('ImagesService', () => {
  let moduleFixture: TestingModule
  let imagesService: ImagesService
  let mapsRepo: Repository<MmpMap>
  let imagesRepo: Repository<MmpImage>

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(
          await createTestConfiguration(process.env.JEST_WORKER_ID || '')
        ),
        AppModule,
      ],
    }).compile()

    imagesService = moduleFixture.get(ImagesService)
    mapsRepo = moduleFixture.get(getRepositoryToken(MmpMap))
    imagesRepo = moduleFixture.get(getRepositoryToken(MmpImage))
  })

  afterAll(async () => {
    await destroyWorkerDatabase(
      mapsRepo.manager.connection,
      process.env.JEST_WORKER_ID || ''
    )
    await moduleFixture.close()
  })

  beforeEach(async () => {
    await truncateDatabase(mapsRepo.manager.connection)
  })

  const createMap = (): Promise<MmpMap> => mapsRepo.save(mapsRepo.create())

  const read = (mapId: string, reference: ImageReference) =>
    imagesService.readImage(mapId, imageIdOf(reference))

  describe('storeImage', () => {
    it('stores the same bytes twice under two references that both resolve', async () => {
      const map = await createMap()

      const first = await imagesService.storeImage(map.id, pngUpload())
      const second = await imagesService.storeImage(map.id, pngUpload())

      expect(first).not.toEqual(second)
      expect(first).toMatch(/^image:[0-9a-f-]{36}$/)
      expect(await read(map.id, first)).toMatchObject({ mimetype: 'image/png' })
      expect(await read(map.id, second)).toMatchObject({
        mimetype: 'image/png',
      })
    })

    it('rejects an upload above the map cap and stores nothing', async () => {
      const previous = process.env.MAX_IMAGE_BYTES_PER_MAP
      process.env.MAX_IMAGE_BYTES_PER_MAP = '1000'
      try {
        const map = await createMap()
        await imagesService.storeImage(map.id, pngUpload(900))

        await expect(
          imagesService.storeImage(map.id, pngUpload(200))
        ).rejects.toThrow(PayloadTooLargeException)
        expect(await imagesRepo.count({ where: { mapId: map.id } })).toBe(1)
      } finally {
        if (previous === undefined) delete process.env.MAX_IMAGE_BYTES_PER_MAP
        else process.env.MAX_IMAGE_BYTES_PER_MAP = previous
      }
    })
  })

  describe('readImage', () => {
    it('returns the stored bytes', async () => {
      const map = await createMap()
      const upload = pngUpload()
      const reference = await imagesService.storeImage(map.id, upload)

      const image = await read(map.id, reference)

      expect(image?.data.equals(upload.buffer)).toBe(true)
    })

    it('returns null for an image only another map holds', async () => {
      const mapA = await createMap()
      const mapB = await createMap()
      const reference = await imagesService.storeImage(mapB.id, pngUpload())

      expect(await read(mapA.id, reference)).toBeNull()
    })

    it('returns null for an id that is not a uuid', async () => {
      const map = await createMap()

      expect(await imagesService.readImage(map.id, '../secret')).toBeNull()
    })
  })
})
