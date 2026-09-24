import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import configService from '../config.service'
import { MapDataModule } from '../map/map-data.module'

// Loads the data access the jobs need and nothing else: no WebSocket gateway,
// no cron schedules, no controllers, no static files.
@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    MapDataModule,
  ],
})
export class JobsModule {}
