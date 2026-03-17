import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import configService from './config.service'
import { MapModule } from './map/map.module'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'
import { SettingsModule } from './settings/settings.module'

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    MapModule,
    SettingsModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'browser'),
      exclude: ['/assets/'],
      // Only serve index.html for known SPA routes to prevent infinite
      // request loops. Without this, any unknown path (e.g.
      // /map/assets/icons/foo.png) returns index.html with HTTP 200,
      // causing bots/crawlers that ignore <base href> to recursively
      // resolve relative paths into ever-deeper nested URLs.
      renderPath:
        /^\/(|map(\/[^/]*)?|privacy|legal|app(\/( settings|shortcuts))?)$/,
    }),
  ],
})
export default class AppModule {}
