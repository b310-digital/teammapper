import {
  Body, Controller, Get, NotFoundException, Param, Post,
} from '@nestjs/common';
import { MmpMap } from '../entities/mmpMap.entity';
import { MapsService } from '../services/maps.service';
import { IMmpClientMap } from '../types';

@Controller('maps')
export default class MapsController {
  constructor(private mapsService: MapsService) {}

  @Get(':id')
  async findOne(@Param('id') mapId: string): Promise<IMmpClientMap> {
    const map: IMmpClientMap = await this.mapsService.exportMapToClient(mapId);
    if (map === null) throw new NotFoundException();

    return map;
  }

  @Post()
  async create(@Body() mmpMap: IMmpClientMap): Promise<IMmpClientMap> {
    const newMap: MmpMap = await this.mapsService.createMap(mmpMap);
    return this.mapsService.exportMapToClient(newMap.id);
  }
}
