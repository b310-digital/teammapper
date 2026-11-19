import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import { LOGO_PNG } from './imageFixtures'

/** What the upstream stand-in received for one request. */
export interface UpstreamHit {
  url: string
}

export type UpstreamHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void

/** Answers with `status` and a JSON `body`. */
export const jsonReply =
  (status: number, body: string): UpstreamHandler =>
  (_req, res) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(body)
  }

/** Answers 200 with `bytes` and the given content type. */
export const imageReply =
  (bytes: Buffer, contentType = 'image/png'): UpstreamHandler =>
  (_req, res) => {
    res.setHeader('content-type', contentType)
    res.end(bytes)
  }

/** Answers 200 with `bytes` in two chunks and no content-length header. */
export const chunkedImageReply =
  (bytes: Buffer): UpstreamHandler =>
  (_req, res) => {
    const half = Math.floor(bytes.length / 2)
    res.setHeader('content-type', 'image/png')
    res.write(bytes.subarray(0, half))
    res.end(bytes.subarray(half))
  }

/** Answers with a redirect to `location`. */
export const redirectReply =
  (location: string): UpstreamHandler =>
  (_req, res) => {
    res.statusCode = 302
    res.setHeader('location', location)
    res.end()
  }

/** Never answers, so the caller runs into its timeout. */
export const silentReply: UpstreamHandler = () => undefined

/** The TeamMapper logo repeated or cut to exactly `size` bytes. */
export const logoBytes = (size: number): Buffer => {
  const copies = Math.ceil(size / LOGO_PNG.length)
  return Buffer.concat(new Array<Buffer>(copies).fill(LOGO_PNG), size)
}

/** A local stand-in for ARASAAC that records every request it receives. */
export class PictogramUpstream {
  readonly hits: UpstreamHit[] = []
  handler: UpstreamHandler = jsonReply(404, '[]')

  private readonly server: Server = createServer((req, res) => {
    this.hits.push({ url: req.url ?? '' })
    this.handler(req, res)
  })

  async start(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve)
    )
  }

  /** `127.0.0.1:<port>` of the running server. */
  get host(): string {
    const { port } = this.server.address() as AddressInfo
    return `127.0.0.1:${port}`
  }

  /** Forgets recorded requests and restores the default 404 answer. */
  reset(): void {
    this.hits.length = 0
    this.handler = jsonReply(404, '[]')
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections()
    await new Promise((resolve) => this.server.close(resolve))
  }
}

/** `127.0.0.1:<port>` of a port where nothing listens. */
export const closedHost = async (): Promise<string> => {
  const upstream = new PictogramUpstream()
  await upstream.start()
  const host = upstream.host
  await upstream.stop()
  return host
}

const ENV_KEYS = ['PICTOGRAM_API_URL', 'PICTOGRAM_IMAGES_URL'] as const

/** Points both pictogram base URLs at `host`, without a trailing slash. */
export const pointEnvAt = (host: string): void => {
  process.env.PICTOGRAM_API_URL = `http://${host}/api`
  process.env.PICTOGRAM_IMAGES_URL = `http://${host}/images`
}

/** Captures the pictogram env vars and returns a function that restores them. */
export const captureEnv = (): (() => void) => {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const)
  return () =>
    saved.forEach(([key, value]) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
}
