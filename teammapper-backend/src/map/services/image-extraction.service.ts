import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, MoreThan, Repository } from 'typeorm'
import { imageIdOf } from '@teammapper/shared'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  ExtractedImage,
  extractImageDataUrls,
  ImageDataUrlExtraction,
  NodeImageReplacement,
  NodeImageSrc,
} from '../utils/imageExtraction'
import { ImagesService } from './images.service'

/** How many maps one batch reads. */
const MAP_BATCH_SIZE = 100

/** What an image extraction run changed. */
export interface ImageExtractionResult {
  /** Maps with at least one changed node. */
  maps: number
  /** Stored images that at least one changed node references. */
  images: number
  /** Nodes whose data URL the service replaced with an image reference. */
  nodes: number
  /** Nodes that kept their data URL. The service logs each one. */
  failedNodes: number
  /** Maps whose extraction threw. The service logs each one. */
  failedMaps: number
}

const DATA_URL_PATTERN = 'data:image/%'

const EMPTY_RESULT: ImageExtractionResult = {
  maps: 0,
  images: 0,
  nodes: 0,
  failedNodes: 0,
  failedMaps: 0,
}

const addResults = (
  a: ImageExtractionResult,
  b: ImageExtractionResult
): ImageExtractionResult => ({
  maps: a.maps + b.maps,
  images: a.images + b.images,
  nodes: a.nodes + b.nodes,
  failedNodes: a.failedNodes + b.failedNodes,
  failedMaps: a.failedMaps + b.failedMaps,
})

/** Counts what the extraction of one map changed. */
const mapResult = (
  plan: ImageDataUrlExtraction,
  replaced: NodeImageReplacement[]
): ImageExtractionResult => ({
  maps: replaced.length > 0 ? 1 : 0,
  images: new Set(replaced.map(({ reference }) => reference)).size,
  nodes: replaced.length,
  failedNodes:
    plan.failedNodeIds.length + plan.replacements.length - replaced.length,
  failedMaps: 0,
})

/** The nodes whose replacement points at the image. */
const nodeIdsOf = (
  replacements: NodeImageReplacement[],
  imageId: string
): string[] =>
  replacements
    .filter(({ reference }) => imageIdOf(reference) === imageId)
    .map(({ nodeId }) => nodeId)

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Moves the data URLs of nodes into the image tables and replaces each with an
 * image reference. The service reads maps in batches by primary key and, per
 * map, only the nodes holding a data URL, so a run holds one map's images in
 * memory at a time.
 *
 * You can run the job while the server runs, and run it again. The service
 * changes a node only while the node still holds the data URL the service
 * read. A map open during the run can write its data URLs back; the next run
 * moves them, and the cleanup job deletes the images that became unused.
 *
 * The service logs every node that keeps its data URL, with its map id and
 * node id, and continues with the next image or map.
 */
@Injectable()
export class ImageExtractionService {
  private readonly logger = new Logger(ImageExtractionService.name)

  constructor(
    @InjectRepository(MmpMap)
    private mapsRepository: Repository<MmpMap>,
    @InjectRepository(MmpNode)
    private nodesRepository: Repository<MmpNode>,
    private imagesService: ImagesService
  ) {}

  /** Extracts the images of every map; reports the total after each batch. */
  async extractAllMaps(
    onBatch: (total: ImageExtractionResult) => void = () => undefined,
    batchSize = MAP_BATCH_SIZE
  ): Promise<ImageExtractionResult> {
    let total = EMPTY_RESULT
    let mapIds = await this.mapIdsAfter(null, batchSize)
    while (mapIds.length > 0) {
      total = addResults(total, await this.extractMaps(mapIds))
      onBatch(total)
      mapIds = await this.mapIdsAfter(mapIds[mapIds.length - 1], batchSize)
    }
    return total
  }

  /** Stores the images of one map and points its nodes at them. */
  async extractMap(mapId: string): Promise<ImageExtractionResult> {
    const plan = extractImageDataUrls(await this.nodesWithDataUrl(mapId))
    this.logFailedNodes(
      mapId,
      plan.failedNodeIds,
      'the data URL is not a valid image of its declared type'
    )
    const stored = await this.storeImages(mapId, plan)
    return mapResult(plan, await this.replaceDataUrls(mapId, stored))
  }

  /** Extracts each map; logs and counts a map that throws, and continues. */
  private async extractMaps(mapIds: string[]): Promise<ImageExtractionResult> {
    let total = EMPTY_RESULT
    for (const mapId of mapIds) {
      try {
        total = addResults(total, await this.extractMap(mapId))
      } catch (error) {
        this.logger.error(
          `Map ${mapId}: extraction failed: ${errorMessage(error)}`
        )
        total = addResults(total, { ...EMPTY_RESULT, failedMaps: 1 })
      }
    }
    return total
  }

  /** Stores each image; returns the replacements whose image it stored. */
  private async storeImages(
    mapId: string,
    { images, replacements }: ImageDataUrlExtraction
  ): Promise<NodeImageReplacement[]> {
    const failedIds = new Set<string>()
    for (const image of images) {
      const stored = await this.storeImage(mapId, image, replacements)
      if (!stored) failedIds.add(image.id)
    }
    return replacements.filter(
      ({ reference }) => !failedIds.has(imageIdOf(reference))
    )
  }

  /**
   * Stores one image and returns true. On failure, logs every node that keeps
   * the data URL and returns false.
   */
  private async storeImage(
    mapId: string,
    { id, mimetype, data }: ExtractedImage,
    replacements: NodeImageReplacement[]
  ): Promise<boolean> {
    try {
      const upload = { buffer: data, mimetype, size: data.length }
      await this.imagesService.storeImageWithoutCap(mapId, id, upload)
      return true
    } catch (error) {
      const reason = `storing the image failed: ${errorMessage(error)}`
      this.logFailedNodes(mapId, nodeIdsOf(replacements, id), reason)
      return false
    }
  }

  private logFailedNodes(mapId: string, nodeIds: string[], reason: string) {
    for (const nodeId of nodeIds) {
      this.logger.warn(
        `Map ${mapId}, node ${nodeId}: kept the inline image: ${reason}`
      )
    }
  }

  /** The next batch of map ids in primary key order. */
  private async mapIdsAfter(
    lastId: string | null,
    batchSize: number
  ): Promise<string[]> {
    const maps = await this.mapsRepository.find({
      select: { id: true },
      where: lastId === null ? {} : { id: MoreThan(lastId) },
      order: { id: 'ASC' },
      take: batchSize,
    })
    return maps.map((map) => map.id)
  }

  private nodesWithDataUrl(mapId: string): Promise<NodeImageSrc[]> {
    return this.nodesRepository.find({
      select: { id: true, imageSrc: true },
      where: { nodeMapId: mapId, imageSrc: Like(DATA_URL_PATTERN) },
    })
  }

  /** Replaces each data URL a node still holds; returns the replaced ones. */
  private async replaceDataUrls(
    mapId: string,
    replacements: NodeImageReplacement[]
  ): Promise<NodeImageReplacement[]> {
    const replaced: NodeImageReplacement[] = []
    for (const replacement of replacements) {
      const reason = await this.replaceDataUrl(mapId, replacement)
      if (reason === null) replaced.push(replacement)
      else this.logFailedNodes(mapId, [replacement.nodeId], reason)
    }
    return replaced
  }

  /** Replaces one data URL; returns why the node kept it, or null. */
  private async replaceDataUrl(
    mapId: string,
    { nodeId, dataUrl, reference }: NodeImageReplacement
  ): Promise<string | null> {
    try {
      const result = await this.nodesRepository.update(
        { nodeMapId: mapId, id: nodeId, imageSrc: dataUrl },
        { imageSrc: reference }
      )
      return result.affected ? null : 'the node changed its image meanwhile'
    } catch (error) {
      return `updating the node failed: ${errorMessage(error)}`
    }
  }
}
