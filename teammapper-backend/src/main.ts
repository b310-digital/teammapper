import { NestFactory } from '@nestjs/core';
import AppModule from './app.module';
import configService from './config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(parseInt(configService.getPort(), 10) || 3000);
}
bootstrap();
