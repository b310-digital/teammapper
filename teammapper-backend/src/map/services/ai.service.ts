import { Injectable, Logger } from '@nestjs/common'
import { generateText, LanguageModel } from 'ai'
import { SYSTEM_PROMPT, userPrompt, SupportedLanguage } from '../utils/prompts'
import { createProvider } from '../utils/aiProvider'
import configService from '../../config.service'
import { RateLimitExceededException } from '../controllers/rate-limit.exception'
import { LlmUsageCounterService } from './llm-usage-counter.service'

export const SYSTEM_PROMPT_TOKEN_OVERHEAD = 200
const DEFAULT_MAX_OUTPUT_TOKENS = 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

interface PerMinuteEntry {
  time: number
  count: number
}

interface Reservation {
  entry: PerMinuteEntry
  dateUsage: string
  estimated: number
}

interface ParsedLimits {
  tpm: number | undefined
  rpm: number | undefined
  tpd: number | undefined
  maxOutputTokens: number
  timeoutMs: number
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)
  private readonly llmConfig = configService.getLLMConfig()
  // NOTE: TPM/RPM limiting is per-process. The daily token cap is DB-backed via
  // LlmUsageCounterService and works across restarts and multi-instance deploys.
  private tokensUsedPerMinute: PerMinuteEntry[] = []
  private readonly limits: ParsedLimits

  constructor(private readonly usageCounter: LlmUsageCounterService) {
    this.limits = {
      tpm: AiService.parseInt(this.llmConfig.tpm),
      rpm: AiService.parseInt(this.llmConfig.rpm),
      tpd: AiService.parseInt(this.llmConfig.tpd),
      maxOutputTokens:
        AiService.parseInt(this.llmConfig.maxOutputTokens) ??
        DEFAULT_MAX_OUTPUT_TOKENS,
      timeoutMs:
        AiService.parseInt(this.llmConfig.timeoutMs) ??
        DEFAULT_REQUEST_TIMEOUT_MS,
    }
  }

  async generateMermaid(
    mindmapDescription: string,
    language: SupportedLanguage
  ): Promise<string> {
    const provider = createProvider(this.llmConfig)
    if (!provider || !this.llmConfig.model) return ''

    const estimated = this.estimateTokens(mindmapDescription)
    const reservation = await this.reserveBudget(estimated)
    let text: string
    let actual: number
    try {
      const result = await this.callLlm(
        provider(this.llmConfig.model),
        mindmapDescription,
        language
      )
      text = result.text
      actual = result.usage.totalTokens ?? 0
    } catch (err) {
      await this.releaseReservation(reservation)
      throw err
    }
    // Reconciliation is best-effort: a failure here must not roll back a
    // successful LLM call (would silently under-bill the budget).
    await this.tryCommitReservation(reservation, actual)
    this.logger.debug(
      `LLM call billed ${actual} tokens (estimated ${estimated})`
    )
    return text
  }

  estimateTokens(input: string): number {
    return Math.ceil(input.length / 4) + SYSTEM_PROMPT_TOKEN_OVERHEAD
  }

  private static parseInt(raw: string | undefined): number | undefined {
    if (!raw) return undefined
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) ? value : undefined
  }

  private async callLlm(
    model: LanguageModel,
    description: string,
    language: SupportedLanguage
  ) {
    return await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: userPrompt(description, language),
      maxOutputTokens: this.limits.maxOutputTokens,
      abortSignal: AbortSignal.timeout(this.limits.timeoutMs),
    })
  }

  private async reserveBudget(estimated: number): Promise<Reservation> {
    this.checkPerMinuteLimits(estimated)
    const entry: PerMinuteEntry = { time: Date.now(), count: estimated }
    this.tokensUsedPerMinute.push(entry)
    const dateUsage = LlmUsageCounterService.currentDateUsage()
    try {
      await this.reserveDaily(dateUsage, estimated)
    } catch (err) {
      this.tokensUsedPerMinute = this.tokensUsedPerMinute.filter(
        (e) => e !== entry
      )
      throw err
    }
    return { entry, dateUsage, estimated }
  }

  private checkPerMinuteLimits(estimated: number): void {
    this.pruneExpiredEntries()
    const currentTokens = this.tokensUsedPerMinute.reduce(
      (sum, e) => sum + e.count,
      0
    )
    if (
      this.limits.tpm !== undefined &&
      currentTokens + estimated > this.limits.tpm
    ) {
      throw new RateLimitExceededException('tokens')
    }
    if (
      this.limits.rpm !== undefined &&
      this.tokensUsedPerMinute.length + 1 > this.limits.rpm
    ) {
      throw new RateLimitExceededException('requests')
    }
  }

  private pruneExpiredEntries(): void {
    const oneMinuteAgo = Date.now() - 60_000
    this.tokensUsedPerMinute = this.tokensUsedPerMinute.filter(
      (e) => e.time > oneMinuteAgo
    )
  }

  private async reserveDaily(
    dateUsage: string,
    estimated: number
  ): Promise<void> {
    const totals = await this.usageCounter.reserve(
      dateUsage,
      estimated,
      this.limits.tpd
    )
    if (totals === null) {
      throw new RateLimitExceededException('tokens')
    }
  }

  private async tryCommitReservation(
    reservation: Reservation,
    actual: number
  ): Promise<void> {
    reservation.entry.count = actual
    try {
      await this.usageCounter.adjustTokens(
        reservation.dateUsage,
        actual - reservation.estimated
      )
    } catch (err) {
      this.logger.warn(
        `Failed to reconcile actual tokens for ${reservation.dateUsage}; keeping conservative reservation. ${(err as Error).message}`
      )
    }
  }

  private async releaseReservation(reservation: Reservation): Promise<void> {
    this.tokensUsedPerMinute = this.tokensUsedPerMinute.filter(
      (e) => e !== reservation.entry
    )
    try {
      await this.usageCounter.release(
        reservation.dateUsage,
        reservation.estimated
      )
    } catch (err) {
      // Don't mask the original error from the caller's catch path.
      this.logger.error(
        `Failed to release reserved tokens for ${reservation.dateUsage}: ${(err as Error).message}`
      )
    }
  }
}
