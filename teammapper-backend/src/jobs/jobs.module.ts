import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import configService from '../config.service'
import { MapDataModule } from '../map/map-data.module'
import { ImageExtractionService } from '../map/services/image-extraction.service'

// Loads the data access the jobs need and nothing else: no WebSocket gateway,
// no cron schedules, no controllers, no static files. Only the extraction job
// needs ImageExtractionService, so the server never instantiates it.
@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    MapDataModule,
  ],
  providers: [ImageExtractionService],
})
export class JobsModule {}
