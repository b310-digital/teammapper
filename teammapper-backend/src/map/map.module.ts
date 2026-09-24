import { MiddlewareConsumer, Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import MapsController from './controllers/maps.controller'
import ImagesController from './controllers/images.controller'
import { MmpMap } from './entities/mmpMap.entity'
import { MmpNode } from './entities/mmpNode.entity'
import { MmpImage } from './entities/mmpImage.entity'
import { MmpImageData } from './entities/mmpImageData.entity'
import { ImagesService } from './services/images.service'
import { ImageStore } from './services/image-store'
import { DatabaseImageStore } from './services/database-image-store.service'
import { LlmUsageCounter } from './entities/llmUsageCounter.entity'
import { MapsService } from './services/maps.service'
import { YjsDocManagerService } from './services/yjs-doc-manager.service'
import { YjsPersistenceService } from './services/yjs-persistence.service'
import { YjsGateway } from './controllers/yjs-gateway.service'
import { WsConnectionLimiterService } from './services/ws-connection-limiter.service'
import { TasksService } from './services/tasks.service'
import MermaidController from './controllers/mermaid.controller'
import { AiService } from './services/ai.service'
import { LlmUsageCounterService } from './services/llm-usage-counter.service'
import cookieParser from 'cookie-parser'
import { PersonIdMiddleware } from '../auth/person-id.middleware'
import configService from '../config.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MmpMap,
      MmpNode,
      MmpImage,
      MmpImageData,
      LlmUsageCounter,
    ]),
    ScheduleModule.forRoot(),
    // Only the image upload route applies ThrottlerGuard.
    ThrottlerModule.forRoot([
      {
        ttl: configService.getUploadImageRateWindowMs(),
        limit: configService.getUploadImageRateLimit(),
      },
    ]),
  ],
  controllers: configService.isAiEnabled()
    ? [MapsController, ImagesController, MermaidController]
    : [MapsController, ImagesController],
  providers: [
    MapsService,
    ImagesService,
    { provide: ImageStore, useClass: DatabaseImageStore },
    TasksService,
    AiService,
    LlmUsageCounterService,
    YjsDocManagerService,
    YjsPersistenceService,
    WsConnectionLimiterService,
    YjsGateway,
  ],
  exports: [MapsService],
})
export class MapModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(cookieParser(), new PersonIdMiddleware().use)
      .forRoutes('api/maps')
  }
}
