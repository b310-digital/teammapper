import {
  Body,
  Req,
  Controller,
  Get,
  Delete,
  NotFoundException,
  Param,
  Post,
  Query,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common'
import { MapsService } from '../services/maps.service'
import { checkWriteAccess } from '../utils/yjsProtocol'
import { YjsDocManagerService } from '../services/yjs-doc-manager.service'
import { YjsGateway } from './yjs-gateway.service'
import {
  IMmpClientDeleteRequest,
  IMmpClientMap,
  IMmpClientMapCreateRequest,
  IMmpClientMapInfo,
  IMmpClientPrivateMap,
  Request,
} from '../types'
import MalformedUUIDError from '../services/uuid.error'
import { EntityNotFoundError } from 'typeorm'

@Controller('api/maps')
export default class MapsController {
  private readonly logger = new Logger(MapsController.name)
  constructor(
    private mapsService: MapsService,
    @Optional()
    @Inject(YjsDocManagerService)
    private yjsDocManager?: YjsDocManagerService,
    @Optional()
    @Inject(YjsGateway)
    private yjsGateway?: YjsGateway
  ) {}

  @Get(':id')
  async findOne(
    @Param('id') mapId: string,
    @Query('secret') secret?: string
  ): Promise<IMmpClientMap | void> {
    try {
      await this.mapsService.updateLastAccessed(mapId)
      const map = await this.mapsService.exportMapToClient(mapId)
      if (!map) throw new NotFoundException()

      const fullMap = await this.mapsService.findMap(mapId)
      const writable = checkWriteAccess(
        fullMap?.modificationSecret ?? null,
        secret ?? null
      )

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
  async findAll(@Req() req?: Request): Promise<IMmpClientMapInfo[]> {
    if (!req) return []
    const pid = req.pid
    if (!pid) return []
    const maps = await this.mapsService.getMapsOfUser(pid)
    return maps
  }

  @Delete(':id')
  async delete(
    @Param('id') mapId: string,
    @Body() body: IMmpClientDeleteRequest
  ): Promise<void> {
    const mmpMap = await this.mapsService.findMap(mapId)
    if (mmpMap && mmpMap.adminId === body.adminId) {
      if (this.yjsGateway && this.yjsDocManager) {
        this.yjsGateway.closeConnectionsForMap(mapId)
        this.yjsDocManager.destroyDoc(mapId)
      }
      await this.mapsService.deleteMap(mapId)
    }
  }

  @Post()
  async create(
    @Body() body: IMmpClientMapCreateRequest,
    @Req() req?: Request
  ): Promise<IMmpClientPrivateMap | undefined> {
    const pid = req?.pid

    const newMap = await this.mapsService.createEmptyMap(body.rootNode, pid)

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
  ): Promise<IMmpClientPrivateMap | undefined> {
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

    const oldNodes = await this.mapsService.findNodes(oldMap.id)

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
