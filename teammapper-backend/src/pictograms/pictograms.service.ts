import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common'
import {
  Pictogram,
  PictogramListSchema,
  SupportedLanguage,
} from '@teammapper/shared'
import * as v from 'valibot'
import configService from '../config.service'

/** Injection token for the upstream request timeout in milliseconds. */
export const PICTOGRAM_FETCH_TIMEOUT_MS = 'PICTOGRAM_FETCH_TIMEOUT_MS'

/** The largest image body accepted from ARASAAC. */
const MAX_IMAGE_BYTES = 1024 * 1024

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Joins a base URL and a path with exactly one slash. */
const joinUrl = (base: string, path: string): string =>
  `${base.replace(/\/+$/, '')}/${path}`

/** Calls ARASAAC as a plain HTTP client and forwards nothing from the browser. */
@Injectable()
export class PictogramsService {
  private readonly logger = new Logger(PictogramsService.name)

  constructor(
    @Inject(PICTOGRAM_FETCH_TIMEOUT_MS) private readonly timeoutMs: number
  ) {}

  /**
   * Returns the search results, or [] when ARASAAC finds no pictogram.
   * Throws BadGatewayException on any other failure.
   */
  async searchPictograms(
    language: SupportedLanguage,
    term: string
  ): Promise<Pictogram[]> {
    const label = `search ${language}`
    const path = `pictograms/${language}/search/${encodeURIComponent(term)}`
    const response = await this.get(
      joinUrl(configService.getPictogramApiUrl(), path),
      label
    )
    if (!response) return []
    return this.parseList(response, label)
  }

  /**
   * Returns the PNG bytes, or null when ARASAAC answers 404.
   * Throws BadGatewayException on any other failure.
   */
  async fetchPictogramImage(id: number): Promise<Buffer | null> {
    const label = `image ${id}`
    const path = `pictograms/${id}/${id}_300.png`
    const response = await this.get(
      joinUrl(configService.getPictogramImagesUrl(), path),
      label
    )
    if (!response) return null
    if (!response.headers.get('content-type')?.startsWith('image/png')) {
      throw this.upstreamFailure(label, 'unexpected content type')
    }
    return this.readCapped(response, label)
  }

  /** The response of a successful call; null on 404. */
  private async get(url: string, label: string): Promise<Response | null> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    }).catch((error: unknown) => {
      throw this.upstreamFailure(label, errorMessage(error))
    })
    if (response.status === 404) return null
    if (!response.ok) {
      throw this.upstreamFailure(label, `status ${response.status}`)
    }
    return response
  }

  private async parseList(
    response: Response,
    label: string
  ): Promise<Pictogram[]> {
    const body: unknown = await response.json().catch((error: unknown) => {
      throw this.upstreamFailure(label, errorMessage(error))
    })
    const result = v.safeParse(PictogramListSchema, body)
    if (!result.success) {
      throw this.upstreamFailure(label, 'unexpected response shape')
    }
    return result.output
  }

  private async readCapped(response: Response, label: string): Promise<Buffer> {
    try {
      return await this.collect(response)
    } catch (error) {
      throw this.upstreamFailure(label, errorMessage(error))
    }
  }

  /** Reads the body stream and stops as soon as it passes the cap. */
  private async collect(response: Response): Promise<Buffer> {
    if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
      throw new Error('content-length above the cap')
    }
    if (!response.body) throw new Error('empty body')
    const reader = response.body.getReader()
    try {
      return Buffer.concat(await this.readChunks(reader))
    } finally {
      await reader.cancel()
    }
  }

  private async readChunks(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<Uint8Array[]> {
    const chunks: Uint8Array[] = []
    let total = 0
    for (
      let next = await reader.read();
      !next.done;
      next = await reader.read()
    ) {
      total += next.value.length
      if (total > MAX_IMAGE_BYTES) throw new Error('body above the cap')
      chunks.push(next.value)
    }
    return chunks
  }

  /** Logs the failure and returns the exception for the caller to throw. */
  private upstreamFailure(label: string, reason: string): BadGatewayException {
    this.logger.warn(`ARASAAC ${label} failed: ${reason}`)
    return new BadGatewayException()
  }
}
