import { Injectable, Logger } from '@nestjs/common'
import { generateText } from 'ai'
import { systemPrompt, SupportedLanguage } from '../utils/prompts'
import { createProvider } from '../utils/aiProvider'
import configService from '../../config.service'
import { RateLimitExceededException } from '../controllers/rate-limit.exception'

const SYSTEM_PROMPT_TOKEN_OVERHEAD = 200

interface RequestTokenEntry {
  time: number
  count: number
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)
  private readonly llmConfig = configService.getLLMConfig()
  // NOTE: Rate limiting is per-process. In multi-instance deployments,
  // effective limits are multiplied by the number of instances.
  private tokensUsedPerMinute: RequestTokenEntry[] = []
  private totalTokensDaily = { count: 0, date: new Date().toLocaleDateString() }
  private readonly parsedLimits: {
    tpm: number | undefined
    rpm: number | undefined
    tpd: number | undefined
  }

  constructor() {
    this.parsedLimits = {
      tpm: this.llmConfig.tpm ? parseInt(this.llmConfig.tpm, 10) : undefined,
      rpm: this.llmConfig.rpm ? parseInt(this.llmConfig.rpm, 10) : undefined,
      tpd: this.llmConfig.tpd ? parseInt(this.llmConfig.tpd, 10) : undefined,
    }
  }

  async generateMermaid(
    mindmapDescription: string,
    language: SupportedLanguage
  ): Promise<string> {
    const provider = createProvider(this.llmConfig)
    if (!provider || !this.llmConfig.model) return ''

    const estimated = this.estimateTokens(mindmapDescription)
    await this.waitForRateLimit(estimated)
    const { text, usage } = await generateText({
      model: provider(this.llmConfig.model),
      system: systemPrompt(language),
      prompt: mindmapDescription,
    })
    this.tokensUsedPerMinute = [
      ...this.tokensUsedPerMinute,
      { time: Date.now(), count: usage.totalTokens ?? 0 },
    ]
    this.totalTokensDaily = {
      ...this.totalTokensDaily,
      count: this.totalTokensDaily.count + (usage.totalTokens ?? 0),
    }
    this.logger.debug(`Daily used token count: ${this.totalTokensDaily.count}`)

    return text
  }

  estimateTokens(input: string): number {
    return Math.ceil(input.length / 4) + SYSTEM_PROMPT_TOKEN_OVERHEAD
  }

  private async waitForRateLimit(estimatedTokens: number) {
    const now = Date.now()
    const oneMinuteAgo = now - 60000
    this.tokensUsedPerMinute = this.tokensUsedPerMinute.filter(
      (entry) => entry.time > oneMinuteAgo
    )
    if (new Date().toLocaleDateString() !== this.totalTokensDaily.date) {
      this.totalTokensDaily = {
        count: 0,
        date: new Date().toLocaleDateString(),
      }
    }

    const currentTokens = this.tokensUsedPerMinute.reduce(
      (sum, entry) => sum + entry.count,
      0
    )
    const currentRequestCount = this.tokensUsedPerMinute.length

    if (
      this.parsedLimits.tpm !== undefined &&
      currentTokens + estimatedTokens > this.parsedLimits.tpm
    ) {
      throw new RateLimitExceededException('tokens')
    }

    if (
      this.parsedLimits.rpm !== undefined &&
      currentRequestCount + 1 > this.parsedLimits.rpm
    ) {
      throw new RateLimitExceededException('requests')
    }

    if (
      this.parsedLimits.tpd !== undefined &&
      this.totalTokensDaily.count + estimatedTokens > this.parsedLimits.tpd
    ) {
      throw new RateLimitExceededException('tokens')
    }
  }
}
