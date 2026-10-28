import { NestExpressApplication } from '@nestjs/platform-express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import configService from './config.service'
import { SettingsService } from './settings/settings.service'

/**
 * Mounts the ARASAAC proxy routes /arasaac/api and /arasaac/images when the
 * pictograms feature flag is on. PICTOGRAM_API_URL and PICTOGRAM_IMAGES_URL set
 * the upstreams. With the flag off the server mounts neither route, so it
 * forwards no request to ARASAAC.
 */
export function mountPictogramProxy(app: NestExpressApplication): void {
  const settings = app.get(SettingsService).getSettings()
  if (!settings.systemSettings.featureFlags.pictograms) return

  mountProxy(app, '/arasaac/api', configService.getPictogramApiUrl())
  mountProxy(app, '/arasaac/images', configService.getPictogramImagesUrl())
}

/** Forwards every request under `route` to `target`, minus the route prefix. */
function mountProxy(
  app: NestExpressApplication,
  route: string,
  target: string
): void {
  app.use(
    route,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^${route}`]: '/' },
    })
  )
}
