import { MiddlewareConsumer, Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { MapDataModule } from './map-data.module'
import { LlmUsageCounter } from './entities/llmUsageCounter.entity'
import { YjsDocManagerService } from './services/yjs-doc-manager.service'
import { YjsPersistenceService } from './services/yjs-persistence.service'
import { YjsGateway } from './controllers/yjs-gateway.service'
import { WsConnectionLimiterService } from './services/ws-connection-limiter.service'
import { TasksService } from './services/tasks.service'
import { AiService } from './services/ai.service'
import { LlmUsageCounterService } from './services/llm-usage-counter.service'
import cookieParser from 'cookie-parser'
import { PersonIdMiddleware } from '../auth/person-id.middleware'
import configService from '../config.service'
import { SettingsModule } from '../settings/settings.module'
import { serverSettings } from '../settings/serverSettings'
import { mapControllers } from './mapControllers'

@Module({
  imports: [
    MapDataModule,
    SettingsModule,
    TypeOrmModule.forFeature([LlmUsageCounter]),
    ScheduleModule.forRoot(),
    // Image uploads and map duplication apply ThrottlerGuard.
    ThrottlerModule.forRoot([
      {
        ttl: configService.getUploadImageRateWindowMs(),
        limit: configService.getUploadImageRateLimit(),
      },
    ]),
  ],
  controllers: mapControllers(serverSettings.systemSettings.featureFlags.ai),
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
