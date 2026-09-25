import {
  BadRequestException,
  Body,
  Req,
  Controller,
  Get,
  Delete,
  NotFoundException,
  Param,
  Post,
  Headers,
  Logger,
} from '@nestjs/common'
import * as v from 'valibot'
import { MapsService } from '../services/maps.service'
import { ImagesService } from '../services/images.service'
import { checkWriteAccess } from '../utils/yjsProtocol'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsGateway } from './yjs-gateway.service'
import {
  ClientMap,
  ClientMapInfo,
  ClientPrivateMap,
  MapCreateSchema,
  MapDeleteSchema,
  MODIFICATION_SECRET_HEADER,
  sanitizeIssues,
} from '@teammapper/shared'
import { Request } from '../types'
import MalformedUUIDError from '../services/uuid.error'
import { EntityNotFoundError } from 'typeorm'

@Controller('api/maps')
export default class MapsController {
  private readonly logger = new Logger(MapsController.name)
  constructor(
    private mapsService: MapsService,
    private yjsDocManager: YjsDocManagerService,
    private yjsGateway: YjsGateway,
    private imagesService: ImagesService
  ) {}

  @Get(':id')
  async findOne(
    @Param('id') mapId: string,
    @Headers(MODIFICATION_SECRET_HEADER) secret?: string
  ): Promise<ClientMap | void> {
    try {
      const map = await this.mapsService.exportMapToClient(mapId)
      if (!map) throw new NotFoundException()

      const fullMap = await this.mapsService.findMap(mapId)
      const writable = checkWriteAccess(
        fullMap?.modificationSecret ?? null,
        secret ?? null
      )

      // Only authorized readers should reset the retention clock; otherwise
      // anonymous GETs (crawlers, attackers) could keep a map alive forever.
      if (writable) {
        await this.mapsService.updateLastAccessed(mapId)
      }

      return { ...map, writable }
    } catch (e) {
      if (e instanceof MalformedUUIDError || e instanceof EntityNotFoundError) {
        throw new NotFoundException()
      } else {
        throw e
      }
    }
  }

  @Get()
  async findAll(@Req() req?: Request): Promise<ClientMapInfo[]> {
    if (!req) return []
    const pid = req.pid
    if (!pid) return []
    const maps = await this.mapsService.getMapsOfUser(pid)
    return maps
  }

  @Delete(':id')
  async delete(
    @Param('id') mapId: string,
    @Body() body: unknown
  ): Promise<void> {
    const result = v.safeParse(MapDeleteSchema, body)
    if (!result.success) {
      throw new BadRequestException(sanitizeIssues(result.issues))
    }
    const mmpMap = await this.mapsService.findMap(mapId)
    if (mmpMap && mmpMap.adminId === result.output.adminId) {
      this.yjsGateway.closeConnectionsForMap(mapId)
      // Delete DB row before destroying the in-memory Y.Doc so that any
      // concurrent reconnection's hydrateDocFromDb sees a missing row and
      // refuses to create a phantom doc.
      await this.mapsService.deleteMap(mapId)
      this.yjsDocManager.destroyDoc(mapId)
    }
  }

  @Post()
  async create(
    @Body() body: unknown,
    @Req() req?: Request
  ): Promise<ClientPrivateMap | undefined> {
    const result = v.safeParse(MapCreateSchema, body)
    if (!result.success) {
      throw new BadRequestException(sanitizeIssues(result.issues))
    }
    const pid = req?.pid

    const newMap = await this.mapsService.createEmptyMap(
      result.output.rootNode,
      pid
    )

    const exportedMap = await this.mapsService.exportMapToClient(newMap.id)

    if (exportedMap) {
      return {
        map: exportedMap,
        adminId: newMap.adminId,
        modificationSecret: newMap.modificationSecret,
      }
    }
  }

  @Post(':id/duplicate')
  async duplicate(
    @Param('id') mapId: string
  ): Promise<ClientPrivateMap | undefined> {
    const oldMap = await this.mapsService.findMap(mapId).catch((e: Error) => {
      if (e.name === 'MalformedUUIDError') {
        this.logger.warn(
          `:id/duplicate(): Wrong/no UUID provided for findMap() with mapId ${mapId}`
        )
        return
      }
    })

    if (!oldMap) throw new NotFoundException()

    const newMap = await this.mapsService.createEmptyMap()

    // Read the nodes before copying the images: an image uploaded in between
    // then gets copied too, instead of a copied reference missing its image.
    const oldNodes = await this.mapsService.findNodes(oldMap.id)

    // The copies keep their ids, so the copied references resolve as is.
    await this.imagesService.copyImages(oldMap.id, newMap.id)

    await this.mapsService.addNodes(newMap.id, oldNodes)

    const exportedMap = await this.mapsService.exportMapToClient(newMap.id)

    if (exportedMap) {
      return {
        map: exportedMap,
        adminId: newMap.adminId,
        modificationSecret: newMap.modificationSecret,
      }
    }
  }
}
