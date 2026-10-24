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
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { MapDuplicationThrottlerGuard } from './map-duplication-throttler.guard'
import configService from '../../config.service'
import * as v from 'valibot'
import { MapsService } from '../services/maps.service'
import type { MmpMap } from '../entities/mmpMap.entity'
import { ImagesService } from '../services/images.service'
import { totalInlineImageBytes } from '../utils/imageStorage'
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
  @UseGuards(MapDuplicationThrottlerGuard)
  @Throttle({
    default: {
      limit: () => configService.getDuplicateMapRateLimit(),
      ttl: () => configService.getDuplicateMapRateWindowMs(),
    },
  })
  async duplicate(
    @Param('id') mapId: string
  ): Promise<ClientPrivateMap | undefined> {
    return this.imagesService.withDuplicationLimit(async () => {
      const oldMap = await this.findMapForDuplication(mapId)

      const oldNodes = await this.mapsService.findNodes(oldMap.id)
      const inlineBytes = totalInlineImageBytes(oldNodes)
      const newMap = await this.mapsService.createEmptyMap()
      try {
        // Read nodes first so an intervening upload cannot leave a missing reference.
        await this.imagesService.copyImages(oldMap.id, newMap.id, inlineBytes)
        await this.mapsService.addNodes(newMap.id, oldNodes)
        const exportedMap = await this.mapsService.exportMapToClient(newMap.id)
        if (!exportedMap) throw new NotFoundException()
        return {
          map: exportedMap,
          adminId: newMap.adminId,
          modificationSecret: newMap.modificationSecret,
        }
      } catch (error) {
        await this.mapsService.deleteMap(newMap.id)
        throw error
      }
    })
  }

  private async findMapForDuplication(mapId: string): Promise<MmpMap> {
    try {
      const map = await this.mapsService.findMap(mapId)
      if (!map) throw new NotFoundException()
      return map
    } catch (error) {
      if (error instanceof MalformedUUIDError) throw new NotFoundException()
      throw error
    }
  }
}
