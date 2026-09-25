import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { Logger } from '@nestjs/common'
import { Repository } from 'typeorm'
import { imageIdOf, isImageReference } from '@teammapper/shared'
import {
  createTestConfiguration,
  destroyWorkerDatabase,
} from '../../../test/db'
import { truncateDatabase } from '../../../test/helper'
import {
  LARGE_LOGO_PNG,
  LARGE_LOGO_URL,
  MISMATCH_URL,
  LOGO_PNG,
  LOGO_URL,
} from '../../../test/imageFixtures'
import { MapDataModule } from '../map-data.module'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpImage } from '../entities/mmpImage.entity'
import { ImagesService } from './images.service'
import {
  ImageExtractionResult,
  ImageExtractionService,
} from './image-extraction.service'

const UPLOADED_REFERENCE = 'image:99999999-9999-4999-8999-999999999999'

describe('ImageExtractionService', () => {
  let moduleFixture: TestingModule
  let imageExtractionService: ImageExtractionService
  let imagesService: ImagesService
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
        MapDataModule,
      ],
      providers: [ImageExtractionService],
    }).compile()

    imageExtractionService = moduleFixture.get(ImageExtractionService)
    imagesService = moduleFixture.get(ImagesService)
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

  afterEach(() => {
    jest.restoreAllMocks()
  })

  /** Captures the warnings the service logs. */
  const spyOnWarnings = () =>
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

  /** Captures the errors the service logs. */
  const spyOnErrors = () =>
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

  const createMap = (): Promise<MmpMap> => mapsRepo.save(mapsRepo.create())

  /** Stores one node per image value; returns the node ids in order. */
  const createNodes = async (
    map: MmpMap,
    imageSrcs: (string | null)[]
  ): Promise<string[]> => {
    const nodes = await nodesRepo.save(
      imageSrcs.map((imageSrc, index) =>
        nodesRepo.create({
          nodeMapId: map.id,
          root: index === 0,
          coordinatesX: 0,
          coordinatesY: 0,
          imageSrc,
        })
      )
    )
    return nodes.map((node) => node.id)
  }

  const imageSrcOf = async (map: MmpMap, nodeId: string) =>
    (await nodesRepo.findOneByOrFail({ nodeMapId: map.id, id: nodeId }))
      .imageSrc

  /** The image a node references, read as the image endpoint reads it. */
  const imageOf = async (map: MmpMap, nodeId: string) => {
    const src = await imageSrcOf(map, nodeId)
    if (!isImageReference(src)) throw new Error(`${nodeId} is inline`)
    return imagesService.readImage(map.id, imageIdOf(src))
  }

  describe('extractMap', () => {
    it('stores each inline image and points its node at it', async () => {
      const map = await createMap()
      const [logoNode, largeLogoNode] = await createNodes(map, [
        LOGO_URL,
        LARGE_LOGO_URL,
      ])

      const result = await imageExtractionService.extractMap(map.id)

      expect({
        result,
        logo: await imageOf(map, logoNode!),
        largeLogo: await imageOf(map, largeLogoNode!),
      }).toEqual({
        result: { maps: 1, images: 2, nodes: 2, failedNodes: 0, failedMaps: 0 },
        logo: { mimetype: 'image/png', data: LOGO_PNG },
        largeLogo: { mimetype: 'image/png', data: LARGE_LOGO_PNG },
      })
    })

    it('stores one image for nodes holding the same data URL', async () => {
      const map = await createMap()
      const [first, second] = await createNodes(map, [LOGO_URL, LOGO_URL])

      const result = await imageExtractionService.extractMap(map.id)

      expect({
        result,
        shared:
          (await imageSrcOf(map, first!)) === (await imageSrcOf(map, second!)),
        rows: await imagesRepo.count({ where: { mapId: map.id } }),
      }).toEqual({
        result: { maps: 1, images: 1, nodes: 2, failedNodes: 0, failedMaps: 0 },
        shared: true,
        rows: 1,
      })
    })

    it('records the byte size of the image', async () => {
      const map = await createMap()
      await createNodes(map, [LOGO_URL])

      await imageExtractionService.extractMap(map.id)

      const [image] = await imagesRepo.find({ where: { mapId: map.id } })
      expect(image?.size).toBe(LOGO_PNG.length)
    })

    it('keeps an invalid data URL, a reference and an empty image, and logs the invalid one', async () => {
      const map = await createMap()
      const ids = await createNodes(map, [
        MISMATCH_URL,
        UPLOADED_REFERENCE,
        null,
      ])
      const warn = spyOnWarnings()

      const result = await imageExtractionService.extractMap(map.id)

      expect({
        result,
        srcs: await Promise.all(ids.map((id) => imageSrcOf(map, id))),
        logs: warn.mock.calls,
      }).toEqual({
        result: { maps: 0, images: 0, nodes: 0, failedNodes: 1, failedMaps: 0 },
        srcs: [MISMATCH_URL, UPLOADED_REFERENCE, null],
        logs: [
          [
            `Map ${map.id}, node ${ids[0]}: kept the inline image: the data URL is not a valid image of its declared type`,
          ],
        ],
      })
    })

    it('moves images above the map cap', async () => {
      const previous = process.env.MAX_IMAGE_BYTES_PER_MAP
      process.env.MAX_IMAGE_BYTES_PER_MAP = '1'
      try {
        const map = await createMap()
        await createNodes(map, [LOGO_URL])

        const result = await imageExtractionService.extractMap(map.id)

        expect(result.images).toBe(1)
      } finally {
        if (previous === undefined) delete process.env.MAX_IMAGE_BYTES_PER_MAP
        else process.env.MAX_IMAGE_BYTES_PER_MAP = previous
      }
    })

    it('keeps a node that changed its image during the move', async () => {
      const map = await createMap()
      const [nodeId] = await createNodes(map, [LOGO_URL])
      const storeImageWithoutCap =
        imagesService.storeImageWithoutCap.bind(imagesService)
      jest
        .spyOn(imagesService, 'storeImageWithoutCap')
        .mockImplementationOnce(async (...args) => {
          await nodesRepo.update(
            { nodeMapId: map.id, id: nodeId! },
            { imageSrc: LARGE_LOGO_URL }
          )
          return storeImageWithoutCap(...args)
        })
      const warn = spyOnWarnings()

      const result = await imageExtractionService.extractMap(map.id)

      expect({
        result,
        src: await imageSrcOf(map, nodeId!),
        logs: warn.mock.calls,
      }).toEqual({
        result: { maps: 0, images: 0, nodes: 0, failedNodes: 1, failedMaps: 0 },
        src: LARGE_LOGO_URL,
        logs: [
          [
            `Map ${map.id}, node ${nodeId}: kept the inline image: the node changed its image meanwhile`,
          ],
        ],
      })
    })

    it('logs every node of an image that fails to store and keeps its data URL', async () => {
      const map = await createMap()
      const [first, second, other] = await createNodes(map, [
        LOGO_URL,
        LOGO_URL,
        LARGE_LOGO_URL,
      ])
      const storeImageWithoutCap =
        imagesService.storeImageWithoutCap.bind(imagesService)
      jest
        .spyOn(imagesService, 'storeImageWithoutCap')
        .mockImplementation(async (mapId, id, upload) => {
          if (upload.buffer.equals(LOGO_PNG)) throw new Error('disk full')
          return storeImageWithoutCap(mapId, id, upload)
        })
      const warn = spyOnWarnings()

      const result = await imageExtractionService.extractMap(map.id)

      expect({
        result,
        srcs: [await imageSrcOf(map, first!), await imageSrcOf(map, second!)],
        other: await imageOf(map, other!),
        logs: warn.mock.calls,
      }).toEqual({
        result: { maps: 1, images: 1, nodes: 1, failedNodes: 2, failedMaps: 0 },
        srcs: [LOGO_URL, LOGO_URL],
        other: { mimetype: 'image/png', data: LARGE_LOGO_PNG },
        logs: [first, second].map((nodeId) => [
          `Map ${map.id}, node ${nodeId}: kept the inline image: storing the image failed: disk full`,
        ]),
      })
    })

    it('changes nothing on a second run', async () => {
      const map = await createMap()
      const [nodeId] = await createNodes(map, [LOGO_URL])
      await imageExtractionService.extractMap(map.id)
      const reference = await imageSrcOf(map, nodeId!)

      const result = await imageExtractionService.extractMap(map.id)

      expect({
        result,
        src: await imageSrcOf(map, nodeId!),
        images: await imagesRepo.count({ where: { mapId: map.id } }),
      }).toEqual({
        result: { maps: 0, images: 0, nodes: 0, failedNodes: 0, failedMaps: 0 },
        src: reference,
        images: 1,
      })
    })
  })

  describe('extractAllMaps', () => {
    it('moves the images of every map across batches', async () => {
      const maps = [await createMap(), await createMap(), await createMap()]
      for (const map of maps) await createNodes(map, [LOGO_URL, LARGE_LOGO_URL])
      const batches: ImageExtractionResult[] = []

      const result = await imageExtractionService.extractAllMaps(
        (total) => batches.push(total),
        2
      )

      expect({ result, batches }).toEqual({
        result: { maps: 3, images: 6, nodes: 6, failedNodes: 0, failedMaps: 0 },
        batches: [
          { maps: 2, images: 4, nodes: 4, failedNodes: 0, failedMaps: 0 },
          { maps: 3, images: 6, nodes: 6, failedNodes: 0, failedMaps: 0 },
        ],
      })
    })

    it('stores each image under the map of its node', async () => {
      const mapA = await createMap()
      const mapB = await createMap()
      const [nodeA] = await createNodes(mapA, [LOGO_URL])
      const [nodeB] = await createNodes(mapB, [LOGO_URL])

      await imageExtractionService.extractAllMaps()

      expect([
        await imageOf(mapA, nodeA!),
        await imageOf(mapB, nodeB!),
      ]).toEqual([
        { mimetype: 'image/png', data: LOGO_PNG },
        { mimetype: 'image/png', data: LOGO_PNG },
      ])
    })

    it('logs the id of a map that fails and continues with the next', async () => {
      const failing = await createMap()
      const working = await createMap()
      const [nodeId] = await createNodes(working, [LOGO_URL])
      const extractMap = imageExtractionService.extractMap.bind(
        imageExtractionService
      )
      jest
        .spyOn(imageExtractionService, 'extractMap')
        .mockImplementation(async (mapId) => {
          if (mapId === failing.id) throw new Error('connection lost')
          return extractMap(mapId)
        })
      const error = spyOnErrors()

      const result = await imageExtractionService.extractAllMaps()

      expect({
        result,
        image: await imageOf(working, nodeId!),
        logs: error.mock.calls,
      }).toEqual({
        result: { maps: 1, images: 1, nodes: 1, failedNodes: 0, failedMaps: 1 },
        image: { mimetype: 'image/png', data: LOGO_PNG },
        logs: [[`Map ${failing.id}: extraction failed: connection lost`]],
      })
    })

    it('returns an empty result without maps', async () => {
      expect(await imageExtractionService.extractAllMaps()).toEqual({
        maps: 0,
        images: 0,
        nodes: 0,
        failedNodes: 0,
        failedMaps: 0,
      })
    })
  })
})
