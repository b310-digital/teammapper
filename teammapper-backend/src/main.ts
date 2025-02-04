import { NestFactory } from '@nestjs/core'
import AppModule from './app.module'
import configService from './config.service'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { GlobalExceptionFilter } from './filters/global-exception.filter'
import { Logger } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'

async function bootstrap() {
  const logger = new Logger('Main Process')

  // Process-level handlers for uncaught errors - anything that happens outside of NestJS, such as type errors.
  // This is only logged server-side so we log the whole stack for better review.
  process.on('warning', (error) => {
    logger.error('Possible uncaught exception: ', error)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const stack =
      reason instanceof Error ? reason.stack : 'No stack trace available'
    logger.error('Unhandled Rejection. Stack trace: ', stack)
  })

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  })

  app.useGlobalFilters(new GlobalExceptionFilter())

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
