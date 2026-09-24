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
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpImage } from '../entities/mmpImage.entity'
import { ImagesService, ImageUpload } from './images.service'
import { MapsService } from './maps.service'

const DAY_MS = 24 * 60 * 60 * 1000

const pngUpload = (size = 64): ImageUpload => {
  const buffer = Buffer.alloc(size)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  return { buffer, mimetype: 'image/png', size }
}

describe('ImagesService', () => {
  let moduleFixture: TestingModule
  let imagesService: ImagesService
  let mapsService: MapsService
  let mapsRepo: Repository<MmpMap>
  let nodesRepo: Repository<MmpNode>
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
    mapsService = moduleFixture.get(MapsService)
    mapsRepo = moduleFixture.get(getRepositoryToken(MmpMap))
    nodesRepo = moduleFixture.get(getRepositoryToken(MmpNode))
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

  /** Moves an image's upload time the given number of days back. */
  const ageImage = async (
    mapId: string,
    reference: ImageReference,
    days: number
  ) => {
    await imagesRepo.update(
      { mapId, id: imageIdOf(reference) },
      { createdAt: new Date(Date.now() - days * DAY_MS) }
    )
  }

  const referenceFromNode = async (map: MmpMap, reference: string) => {
    await nodesRepo.save(
      nodesRepo.create({
        nodeMapId: map.id,
        root: true,
        coordinatesX: 0,
        coordinatesY: 0,
        imageSrc: reference,
      })
    )
  }

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

  describe('images follow their map', () => {
    it('keeps every image readable in a duplicate after the source is deleted', async () => {
      const source = await createMap()
      const reference = await imagesService.storeImage(source.id, pngUpload())
      const copy = await createMap()

      await imagesService.copyImages(source.id, copy.id)
      await mapsService.deleteMap(source.id)

      expect(await read(copy.id, reference)).not.toBeNull()
      expect(await read(source.id, reference)).toBeNull()
    })

    it('counts a copied image as uploaded at the time of duplication', async () => {
      const source = await createMap()
      const reference = await imagesService.storeImage(source.id, pngUpload())
      await ageImage(source.id, reference, 30)
      const copy = await createMap()

      await imagesService.copyImages(source.id, copy.id)

      const row = await imagesRepo.findOneByOrFail({
        mapId: copy.id,
        id: imageIdOf(reference),
      })
      expect(Date.now() - row.createdAt.getTime()).toBeLessThan(DAY_MS)
    })

    it('deletes the images of a map the user deletes', async () => {
      const map = await createMap()
      const reference = await imagesService.storeImage(map.id, pngUpload())

      await mapsService.deleteMap(map.id)

      expect(await read(map.id, reference)).toBeNull()
    })

    it('deletes the images of a map the outdated-maps job deletes', async () => {
      const map = await mapsRepo.save(
        mapsRepo.create({
          lastModified: new Date(Date.now() - 60 * DAY_MS),
          lastAccessed: new Date(Date.now() - 60 * DAY_MS),
        })
      )
      const reference = await imagesService.storeImage(map.id, pngUpload())

      await mapsService.deleteOutdatedMaps(30)

      expect(await read(map.id, reference)).toBeNull()
    })
  })

  describe('deleteUnusedImages', () => {
    it('deletes an unused image uploaded 8 days ago', async () => {
      const map = await createMap()
      const reference = await imagesService.storeImage(map.id, pngUpload())
      await ageImage(map.id, reference, 8)

      expect(await imagesService.deleteUnusedImages()).toBe(1)
      expect(await read(map.id, reference)).toBeNull()
    })

    it('keeps an unused image from 3 days ago and a referenced one from 30 days ago', async () => {
      const map = await createMap()
      const recent = await imagesService.storeImage(map.id, pngUpload())
      await ageImage(map.id, recent, 3)
      const referenced = await imagesService.storeImage(map.id, pngUpload())
      await ageImage(map.id, referenced, 30)
      await referenceFromNode(map, referenced)

      expect(await imagesService.deleteUnusedImages()).toBe(0)
      expect(await read(map.id, recent)).not.toBeNull()
      expect(await read(map.id, referenced)).not.toBeNull()
    })

    it('deletes an old image that only a node of another map references', async () => {
      const map = await createMap()
      const other = await createMap()
      const reference = await imagesService.storeImage(map.id, pngUpload())
      await ageImage(map.id, reference, 8)
      await referenceFromNode(other, reference)

      expect(await imagesService.deleteUnusedImages()).toBe(1)
    })
  })
})
