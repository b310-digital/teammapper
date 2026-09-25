import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, MoreThan, Repository } from 'typeorm'
import { imageIdOf } from '@teammapper/shared'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  ExtractedImage,
  extractImageDataUrls,
  NodeImageReplacement,
  NodeImageSrc,
} from '../utils/imageExtraction'
import { ImagesService } from './images.service'

/** How many maps one batch reads. */
export const IMAGE_EXTRACTION_MAP_BATCH_SIZE = 100

/** What an image extraction run changed. */
export interface ImageExtractionResult {
  maps: number
  images: number
  nodes: number
  /** Nodes that kept their data URL; the log names each one. */
  failedNodes: number
  /** Maps whose extraction stopped with an error; the log names each one. */
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
 * Moves the inline data URLs of nodes into the image tables and replaces
 * them with image references. Reads maps in batches by primary key and the
 * nodes of each map by its index, so one run reads every node once and holds
 * one map's images in memory at a time.
 *
 * Safe to run while the server runs and to run again. A node only changes
 * while it still holds the data URL that was read. A map open during the run
 * can write its data URLs back; the next run moves them, and the cleanup job
 * deletes the images that became unused.
 *
 * Every node that keeps its data URL is logged with its map id and node id,
 * and the run continues with the next image or map.
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

  /** Moves the inline images of every map; reports after each batch. */
  async extractAllMaps(
    onBatch: (total: ImageExtractionResult) => void = () => undefined,
    batchSize = IMAGE_EXTRACTION_MAP_BATCH_SIZE
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

  /** Stores the inline images of one map and points its nodes at them. */
  async extractMap(mapId: string): Promise<ImageExtractionResult> {
    const { images, replacements, failedNodeIds } = extractImageDataUrls(
      await this.nodesWithDataUrl(mapId)
    )
    this.logFailedNodes(
      mapId,
      failedNodeIds,
      'the data URL is no valid image of its declared type'
    )
    const stored = await this.storeImages(mapId, images, replacements)
    const nodes = await this.replaceDataUrls(mapId, stored.replacements)
    return {
      maps: nodes > 0 ? 1 : 0,
      images: stored.images,
      nodes,
      failedNodes: failedNodeIds.length + replacements.length - nodes,
      failedMaps: 0,
    }
  }

  /** Extracts each map; a failed map is logged and counted, not rethrown. */
  private async extractMaps(mapIds: string[]): Promise<ImageExtractionResult> {
    let total = EMPTY_RESULT
    for (const mapId of mapIds) {
      total = addResults(total, await this.extractMapOrLog(mapId))
    }
    return total
  }

  private async extractMapOrLog(mapId: string): Promise<ImageExtractionResult> {
    try {
      return await this.extractMap(mapId)
    } catch (error) {
      this.logger.error(
        `Map ${mapId}: extraction failed: ${errorMessage(error)}`
      )
      return { ...EMPTY_RESULT, failedMaps: 1 }
    }
  }

  /**
   * Stores each image; returns how many were stored and the replacements of
   * the nodes whose image was stored. A failed image is logged with the nodes
   * that keep its data URL.
   */
  private async storeImages(
    mapId: string,
    images: ExtractedImage[],
    replacements: NodeImageReplacement[]
  ): Promise<{ images: number; replacements: NodeImageReplacement[] }> {
    const failedIds = new Set<string>()
    for (const image of images) {
      const error = await this.storeImage(mapId, image)
      if (error === null) continue
      failedIds.add(image.id)
      this.logFailedNodes(
        mapId,
        nodeIdsOf(replacements, image.id),
        `storing the image failed: ${error}`
      )
    }
    return {
      images: images.length - failedIds.size,
      replacements: replacements.filter(
        ({ reference }) => !failedIds.has(imageIdOf(reference))
      ),
    }
  }

  /** Stores one image; returns the error message, or null on success. */
  private async storeImage(
    mapId: string,
    { id, mimetype, data, size }: ExtractedImage
  ): Promise<string | null> {
    try {
      await this.imagesService.storeExistingImage(mapId, id, {
        buffer: data,
        mimetype,
        size,
      })
      return null
    } catch (error) {
      return errorMessage(error)
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
    lastId: string | null | undefined,
    batchSize: number
  ): Promise<string[]> {
    const maps = await this.mapsRepository.find({
      select: { id: true },
      where: lastId ? { id: MoreThan(lastId) } : {},
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

  /**
   * Replaces each data URL a node still holds; returns the nodes changed. A
   * node that changed its image meanwhile, or whose update fails, is logged.
   */
  private async replaceDataUrls(
    mapId: string,
    replacements: NodeImageReplacement[]
  ): Promise<number> {
    let changed = 0
    for (const replacement of replacements) {
      const reason = await this.replaceDataUrl(mapId, replacement)
      if (reason === null) changed++
      else this.logFailedNodes(mapId, [replacement.nodeId], reason)
    }
    return changed
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
