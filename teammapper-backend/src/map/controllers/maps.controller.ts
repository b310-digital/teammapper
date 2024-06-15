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

  @Post(':id/share')
  async duplicate(
    @Param('id') mapId: string,
  ): Promise<IMmpClientPrivateMap> {
    // All the Mmp functions seem to be minted to use client-side data and interfaces, so we'll have to export our map to a client-side version first before creating a new one
    const oldMap = await this.mapsService.exportMapToClient(mapId).catch((e: Error) => {
      if (e.name === 'MalformedUUIDError') throw new NotFoundException()
    })

    const rootNode = oldMap?.data.find(x => x.isRoot)
    if (!rootNode) {
      return Promise.reject()
    }

    const newMap = await this.mapsService.createEmptyMap(rootNode)

    const otherNodes = oldMap?.data.filter(x => !x.isRoot)

    if (otherNodes && otherNodes.length > 0) {
      /**
       * The reason we do a round-trip to the client map here is because we need the root node ID of the new map - otherwise calling addNodes is pointless, as it's unable to assign the nodes to the 'new' root node properly.
       * This also means we need to change all parent IDs of existing nodes to the new root node ID, but only for those directly adjacent to the root node.
       * Nested nodes are not affected because they actually keep their ID when being assigned to the new map.
       */
      const oldRootNodeId = rootNode.id
      const newRootNodeId = (await this.mapsService.exportMapToClient(newMap.id)).data.find(x => x.isRoot)?.id ?? oldRootNodeId; // This might not be a sensible fallback

      const updatedNodes = otherNodes.map(x => {
        if (x.parent === oldRootNodeId) {
          return {
            ...x,
            parent: newRootNodeId,
          }
        }

        return x
      })
      
      await this.mapsService.addNodes(newMap.id, updatedNodes)
    }

    return {
      map: await this.mapsService.exportMapToClient(newMap.id),
      adminId: newMap.adminId,
      modificationSecret: newMap.modificationSecret
    }
  }
}
