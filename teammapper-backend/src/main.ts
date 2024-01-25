import { NestFactory } from '@nestjs/core'
import AppModule from './app.module'
import configService from './config.service'
import { createProxyMiddleware } from 'http-proxy-middleware'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

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
