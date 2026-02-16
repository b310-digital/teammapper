import { MiddlewareConsumer, Module, Provider } from '@nestjs/common'
import { CacheModule } from '@nestjs/cache-manager'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import MapsController from './controllers/maps.controller'
import { MapsGateway } from './controllers/maps.gateway'
import { MmpMap } from './entities/mmpMap.entity'
import { MmpNode } from './entities/mmpNode.entity'
import { MapsService } from './services/maps.service'
import { YjsDocManagerService } from './services/yjs-doc-manager.service'
import { YjsPersistenceService } from './services/yjs-persistence.service'
import { YjsGateway } from './controllers/yjs-gateway.service'
import { TasksService } from './services/tasks.service'
import MermaidController from './controllers/mermaid.controller'
import { AiService } from './services/ai.service'
import cookieParser from 'cookie-parser'
import { PersonIdMiddleware } from '../auth/person-id.middleware'
import configService from '../config.service'

// When Yjs is enabled, the Socket.io gateway (MapsGateway) must be excluded
// because both cannot bind to the same HTTP upgrade path simultaneously.
const baseProviders: Provider[] = [
  MapsService,
  YjsDocManagerService,
  YjsPersistenceService,
  YjsGateway,
  TasksService,
  AiService,
]

const mapProviders: Provider[] = configService.isYjsEnabled()
  ? baseProviders
  : [...baseProviders, MapsGateway]

@Module({
  imports: [
    TypeOrmModule.forFeature([MmpMap, MmpNode]),
    CacheModule.register(),
    ScheduleModule.forRoot(),
  ],
  controllers: [MapsController, MermaidController],
  providers: mapProviders,
  exports: [MapsService],
})
export class MapModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(cookieParser(), new PersonIdMiddleware().use)
      .forRoutes('api/maps')
  }
}
