import { MiddlewareConsumer, Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import MapsController from './controllers/maps.controller'
import ImagesController from './controllers/images.controller'
import { MapDataModule } from './map-data.module'
import { LlmUsageCounter } from './entities/llmUsageCounter.entity'
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
    MapDataModule,
    TypeOrmModule.forFeature([LlmUsageCounter]),
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
    TasksService,
    AiService,
    LlmUsageCounterService,
    YjsDocManagerService,
    YjsPersistenceService,
    WsConnectionLimiterService,
    YjsGateway,
  ],
})
export class MapModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(cookieParser(), new PersonIdMiddleware().use)
      .forRoutes('api/maps')
  }
}
