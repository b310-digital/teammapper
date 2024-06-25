import {
  Body,
  Controller,
  Get,
  Delete,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common'
import { MapsService } from '../services/maps.service'
import {
  IMmpClientDeleteRequest,
  IMmpClientMap,
  IMmpClientMapCreateRequest,
  IMmpClientPrivateMap,
} from '../types'

@Controller('api/maps')
export default class MapsController {
  constructor(private mapsService: MapsService) {}

  @Get(':id')
  async findOne(@Param('id') mapId: string): Promise<IMmpClientMap | void> {
    // If we update lastAccessed first, we guarantee that the exportMapToClient returns a fresh map that includes an up-to-date lastAccessed field
    await this.mapsService.updateLastAccessed(mapId)

    const map = await this.mapsService.exportMapToClient(mapId).catch((e: Error) => {
      if (e.name === 'MalformedUUIDError') throw new NotFoundException()
    })
    if (!map) throw new NotFoundException()

    return map
  }

  @Delete(':id')
  async delete(
    @Param('id') mapId: string,
    @Body() body: IMmpClientDeleteRequest
  ): Promise<void> {
    const mmpMap = await this.mapsService.findMap(mapId)
    if (mmpMap && mmpMap.adminId === body.adminId) this.mapsService.deleteMap(mapId)
  }

  @Post()
  async create(
    @Body() body: IMmpClientMapCreateRequest
  ): Promise<IMmpClientPrivateMap> {
    const newMap = await this.mapsService.createEmptyMap(body.rootNode)
    return {
      map: await this.mapsService.exportMapToClient(newMap.id),
      adminId: newMap.adminId,
      modificationSecret: newMap.modificationSecret,
    }
  }

  @Post(':id/duplicate')
  async duplicate(
    @Param('id') mapId: string,
  ): Promise<IMmpClientPrivateMap> {
    const oldMap = await this.mapsService.findMap(mapId).catch((e: Error) => {
      if (e.name === 'MalformedUUIDError') throw new NotFoundException()
    })

    if (!oldMap) throw new NotFoundException()

    const newMap = await this.mapsService.createEmptyMap()

    const oldNodes = await this.mapsService.findNodes(oldMap.id)
    
    await this.mapsService.addNodes(newMap.id, oldNodes)
    
    return {
      map: await this.mapsService.exportMapToClient(newMap.id),
      adminId: newMap.adminId,
      modificationSecret: newMap.modificationSecret
    }
  }
}
