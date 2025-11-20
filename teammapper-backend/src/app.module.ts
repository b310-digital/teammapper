import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import configService from './config.service'
import { MapModule } from './map/map.module'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'
import { SettingsModule } from './settings/settings.module'
import { APP_GUARD } from '@nestjs/core'
import { PersonIdGuard } from './auth/person-id.guard'

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    MapModule,
    SettingsModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'browser'),
      exclude: ['/assets/'],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: PersonIdGuard,
    },
  ],
})
export default class AppModule {}
