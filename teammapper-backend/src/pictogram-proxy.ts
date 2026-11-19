import { NestExpressApplication } from '@nestjs/platform-express'
import { IncomingMessage, ServerResponse } from 'http'
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

/**
 * The request headers that a pictogram search or image fetch needs.
 * `changeOrigin` rewrites `host` to the upstream. Both routes serve GET
 * requests only, so the list leaves out body headers such as `content-type`.
 */
const FORWARDED_HEADERS = new Set([
  'host',
  'accept',
  'accept-encoding',
  'accept-language',
  'if-none-match',
  'if-modified-since',
])

/**
 * Deletes every request header outside FORWARDED_HEADERS, such as cookies,
 * credentials and the referer, before the proxy copies the headers. The
 * filter edits the incoming request because http-proxy skips its `proxyReq`
 * event when a request carries `Expect`.
 */
function stripUnlistedHeaders(
  req: IncomingMessage,
  _res: ServerResponse,
  next: () => void
): void {
  Object.keys(req.headers)
    .filter((name) => !FORWARDED_HEADERS.has(name))
    .forEach((name) => delete req.headers[name])
  next()
}

/** Forwards every request under `route` to `target`, minus the route prefix. */
function mountProxy(
  app: NestExpressApplication,
  route: string,
  target: string
): void {
  app.use(
    route,
    stripUnlistedHeaders,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^${route}`]: '/' },
    })
  )
}
