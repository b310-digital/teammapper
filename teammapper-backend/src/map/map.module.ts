import { MiddlewareConsumer, Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import MapsController from './controllers/maps.controller'
import { MmpMap } from './entities/mmpMap.entity'
import { MmpNode } from './entities/mmpNode.entity'
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
    TypeOrmModule.forFeature([MmpMap, MmpNode, LlmUsageCounter]),
    ScheduleModule.forRoot(),
  ],
  controllers: configService.isAiEnabled()
    ? [MapsController, MermaidController]
    : [MapsController],
  providers: [
    MapsService,
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
