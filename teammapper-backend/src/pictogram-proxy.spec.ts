import { jest } from '@jest/globals'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { createServer, IncomingHttpHeaders, Server } from 'http'
import { AddressInfo } from 'net'
import request from 'supertest'
import { mountPictogramProxy } from './pictogram-proxy'
import { SettingsService } from './settings/settings.service'

/** Builds a settings service stub that reports the given pictograms flag. */
const createSettingsService = (pictograms: boolean) => ({
  getSettings: () => ({ systemSettings: { featureFlags: { pictograms } } }),
})

/** Builds an app stub whose settings report the given pictograms flag. */
const createApp = (pictograms: boolean) => {
  const use = jest.fn()
  const settingsService = createSettingsService(pictograms)
  const app = { get: () => settingsService, use }
  return { app: app as unknown as NestExpressApplication, use }
}

describe('mountPictogramProxy', () => {
  it('mounts both ARASAAC routes when pictograms are enabled', () => {
    const { app, use } = createApp(true)

    mountPictogramProxy(app)

    const routes = use.mock.calls.map(([route]) => route)
    expect(routes).toEqual(['/arasaac/api', '/arasaac/images'])
  })

  it('mounts no route when pictograms are disabled', () => {
    const { app, use } = createApp(false)

    mountPictogramProxy(app)

    expect(use).not.toHaveBeenCalled()
  })
})

/** What the upstream stand-in received for one proxied request. */
interface UpstreamEcho {
  url: string
  headers: IncomingHttpHeaders
}

/** Starts a stand-in for ARASAAC that answers with the request it received. */
const startUpstream = async (): Promise<Server> => {
  const server = createServer((req, res) => {
    const echo: UpstreamEcho = { url: req.url ?? '', headers: req.headers }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(echo))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}

/** Boots a Nest app with pictograms on and the proxy routes mounted. */
const startProxyApp = async (): Promise<NestExpressApplication> => {
  @Module({
    providers: [
      { provide: SettingsService, useValue: createSettingsService(true) },
    ],
  })
  class ProxyTestModule {}

  const app = await NestFactory.create<NestExpressApplication>(
    ProxyTestModule,
    { logger: false }
  )
  mountPictogramProxy(app)
  await app.init()
  return app
}

const sensitiveHeaders = {
  cookie: 'session=secret',
  authorization: 'Bearer secret',
  referer: 'http://teammapper.example/map/1',
  origin: 'http://teammapper.example',
  'user-agent': 'browser/1.0',
  'x-forwarded-for': '192.168.0.9',
  'x-custom': 'value',
}

const neededHeaders = {
  accept: 'application/json',
  'accept-encoding': 'gzip',
  'accept-language': 'de',
  'if-none-match': '"etag-1"',
  'if-modified-since': 'Tue, 01 Jan 2030 00:00:00 GMT',
}

describe('pictogram proxy request headers', () => {
  let upstream: Server
  let upstreamHost: string
  let app: NestExpressApplication
  const originalEnv = { ...process.env }

  beforeAll(async () => {
    upstream = await startUpstream()
    const { port } = upstream.address() as AddressInfo
    upstreamHost = `127.0.0.1:${port}`
    process.env.PICTOGRAM_API_URL = `http://${upstreamHost}/api`
    process.env.PICTOGRAM_IMAGES_URL = `http://${upstreamHost}/images`
    app = await startProxyApp()
  })

  afterAll(async () => {
    await app.close()
    await new Promise((resolve) => upstream.close(resolve))
    restoreEnv('PICTOGRAM_API_URL')
    restoreEnv('PICTOGRAM_IMAGES_URL')
  })

  /** Restores `key` to its value before the suite, or deletes `key` when it was unset. */
  const restoreEnv = (key: string) => {
    const original = originalEnv[key]
    if (original === undefined) delete process.env[key]
    else process.env[key] = original
  }

  /**
   * Sends a GET through the proxy and returns what the upstream received.
   * The request carries the sensitive headers, the needed headers and `extraHeaders`.
   */
  const proxy = async (
    path: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<UpstreamEcho> => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set({ ...sensitiveHeaders, ...neededHeaders, ...extraHeaders })
      .expect(200)
    return response.body as UpstreamEcho
  }

  describe.each([
    [
      'search',
      '/arasaac/api/pictograms/de/search/haus',
      '/api/pictograms/de/search/haus',
    ],
    [
      'image',
      '/arasaac/images/pictograms/2/2_300.png',
      '/images/pictograms/2/2_300.png',
    ],
  ])('%s route', (_name, path, upstreamPath) => {
    it('forwards the request to the upstream path', async () => {
      const echo = await proxy(path)

      expect(echo.url).toBe(upstreamPath)
    })

    it.each(Object.keys(sensitiveHeaders))(
      'drops the %s header',
      async (header) => {
        const echo = await proxy(path)

        expect(echo.headers).not.toHaveProperty(header)
      }
    )

    it('drops the sensitive headers of a request that carries Expect', async () => {
      const echo = await proxy(path, { expect: '100-continue' })

      const forwarded = Object.keys(echo.headers)
      expect(forwarded.filter((name) => name in sensitiveHeaders)).toEqual([])
    })

    it('forwards the headers a pictogram fetch needs', async () => {
      const echo = await proxy(path)

      expect(echo.headers).toMatchObject(neededHeaders)
    })

    it('sets the host header to the upstream host', async () => {
      const echo = await proxy(path)

      expect(echo.headers.host).toBe(upstreamHost)
    })
  })
})
