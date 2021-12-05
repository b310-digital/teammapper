import {
  Body, Controller, Get, NotFoundException, Param, Post,
} from '@nestjs/common';
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
  create(@Body() mmpMap: IMmpClientMap) {
    return this.mapsService.createMap(mmpMap);
  }
}
