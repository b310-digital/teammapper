import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'
import configService from './config.service'
import { MapModule } from './map/map.module'

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    MapModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'browser'),
    }),
  ],
})
export default class AppModule {}
