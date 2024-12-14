import { NestFactory } from '@nestjs/core'
import AppModule from './app.module'
import configService from './config.service'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { Logger } from '@nestjs/common'

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Process-level handlers for uncaught errors - anything that happens outside of NestJS, such as type errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception: ', error.stack);
  });

  process.on('unhandledRejection', (reason: any) => {
    const stack = reason instanceof Error ? reason.stack : 'No stack trace available';
    logger.error('Unhandled Rejection. Stack trace: ', stack);
  });

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  })

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.use(
    '/arasaac/api',
    createProxyMiddleware({
      target: 'https://api.arasaac.org/api',
      changeOrigin: true,
      pathRewrite: {
        '^/arasaac/api': '/',
      },
    })
  )

  app.use(
    '/arasaac/images',
    createProxyMiddleware({
      target: 'https://static.arasaac.org/',
      changeOrigin: true,
      pathRewrite: {
        '^/arasaac/images': '/',
      },
    })
  )

  await app.listen(configService.getPort())
}
bootstrap()
