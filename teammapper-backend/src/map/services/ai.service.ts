import { Inject, Injectable, Logger } from '@nestjs/common'
import { generateText, LanguageModel, LanguageModelUsage } from 'ai'
import {
  AiMapShape,
  MermaidCreateResult,
  SupportedLanguage,
} from '@teammapper/shared'
import {
  DEFAULT_AI_MAP_SHAPE,
  systemPrompt,
  userPrompt,
} from '../utils/prompts'
import { createProvider } from '../utils/aiProvider'
import { pruneMindmap } from '../utils/pruneMindmap'
import configService from '../../config.service'
import { RateLimitExceededException } from '../controllers/rate-limit.exception'
import {
  LlmUsageCounting,
  LlmUsageCounterService,
} from './llm-usage-counter.service'

// A reasoning model spends its thinking from the same output budget as the
// answer, so both defaults leave room for long reasoning output.
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

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

  constructor(
    // The parameter is an interface, so Nest has no design-time token for it
    // and the provider has to be named explicitly.
    @Inject(LlmUsageCounterService)
    private readonly usageCounter: LlmUsageCounting
  ) {
    this.limits = {
      tpm: AiService.parseLimit(this.llmConfig.tpm),
      rpm: AiService.parseLimit(this.llmConfig.rpm),
      tpd: AiService.parseLimit(this.llmConfig.tpd),
      maxOutputTokens:
        AiService.parsePositive(this.llmConfig.maxOutputTokens) ??
        DEFAULT_MAX_OUTPUT_TOKENS,
      timeoutMs:
        AiService.parsePositive(this.llmConfig.timeoutMs) ??
        DEFAULT_REQUEST_TIMEOUT_MS,
    }
  }

  async generateMermaid(
    mindmapDescription: string,
    language: SupportedLanguage,
    shape: AiMapShape = DEFAULT_AI_MAP_SHAPE
  ): Promise<MermaidCreateResult> {
    const provider = createProvider(this.llmConfig)
    if (!provider || !this.llmConfig.model) {
      return { mermaid: '', truncated: false }
    }

    const system = systemPrompt(shape)
    const prompt = userPrompt(mindmapDescription, language)
    const estimated = this.estimateTokens(system, prompt)
    const reservation = await this.reserveBudget(estimated)
    // A failed call keeps its reservation: the provider may have billed it.
    const result = await this.callLlm(
      provider(this.llmConfig.model),
      system,
      prompt
    )
    // Without reported usage the estimate stays booked.
    await this.tryCommitReservation(
      reservation,
      result.usage.totalTokens ?? estimated
    )
    this.logUsage(estimated, result.usage)
    return {
      mermaid: pruneMindmap(result.text, shape),
      truncated: result.finishReason === 'length',
    }
  }

  /** Logs the token counts of one LLM call. */
  private logUsage(estimated: number, usage: LanguageModelUsage): void {
    this.logger.debug(
      `LLM call billed ${usage.totalTokens ?? 0} tokens (estimated ${estimated}, ` +
        `input ${usage.inputTokens ?? 0}, output ${usage.outputTokens ?? 0}, ` +
        `reasoning ${usage.outputTokenDetails?.reasoningTokens ?? 0}, ` +
        `cap ${this.limits.maxOutputTokens})`
    )
  }

  /**
   * Estimates the most tokens one call can bill: one token per character of
   * the prompts sent, which no tokenizer exceeds, plus the full output cap.
   * The reservation holds this estimate until the call reports its real usage,
   * so parallel calls cannot overshoot a limit.
   */
  private estimateTokens(system: string, prompt: string): number {
    return system.length + prompt.length + this.limits.maxOutputTokens
  }

  /** Reads a rate limit. A limit of 0 blocks every call. */
  private static parseLimit(raw: string | undefined): number | undefined {
    if (!raw) return undefined
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) ? value : undefined
  }

  /** Reads a positive integer; anything else counts as unset. */
  private static parsePositive(raw: string | undefined): number | undefined {
    const value = AiService.parseLimit(raw)
    return value !== undefined && value > 0 ? value : undefined
  }

  private async callLlm(model: LanguageModel, system: string, prompt: string) {
    return await generateText({
      model,
      system,
      prompt,
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
}
