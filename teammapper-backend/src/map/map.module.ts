import { Module } from '@nestjs/common'
import { CacheModule } from '@nestjs/cache-manager'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import MapsController from './controllers/maps.controller'
import { MapsGateway } from './controllers/maps.gateway'
import { MmpMap } from './entities/mmpMap.entity'
import { MmpNode } from './entities/mmpNode.entity'
import { MapsService } from './services/maps.service'
import { TasksService } from './services/tasks.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([MmpMap, MmpNode]),
    CacheModule.register(),
    ScheduleModule.forRoot(),
  ],
  controllers: [MapsController],
  providers: [MapsService, MapsGateway, TasksService],
  exports: [MapsService],
})
export class MapModule {}
