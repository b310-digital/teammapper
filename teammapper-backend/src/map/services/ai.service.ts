import { Injectable, Logger } from '@nestjs/common'
import { generateText } from 'ai'
import { systemPrompt } from '../utils/prompts'
import { createProvider } from '../utils/aiProvider'
import configService from '../../config.service'
import { RateLimitExceededException } from '../controllers/rate-limit.exception'

const DEFAULT_ESTIMATED_TOKENS_COUNT = 1000

interface RequestTokenEntry {
  time: number
  count: number
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)
  private readonly llmConfig = configService.getLLMConfig()
  tokens: RequestTokenEntry[]

  constructor() {
    this.tokens = []
  }

  async generateMermaid(
    mindmapDescription: string,
    language: string
  ): Promise<string> {
    const provider = createProvider(this.llmConfig)
    if (!provider || !this.llmConfig.model) return ''

    await this.waitForRateLimit(DEFAULT_ESTIMATED_TOKENS_COUNT)
    const { text, usage } = await generateText({
      model: provider(this.llmConfig.model),
      system: systemPrompt(language),
      prompt: mindmapDescription,
    })
    this.tokens.push({ time: Date.now(), count: usage.totalTokens ?? 0 })

    return text
  }

  private async waitForRateLimit(estimatedTokens: number) {
    const now = Date.now()
    const oneMinuteAgo = now - 60000
    this.tokens = this.tokens.filter((entry) => entry.time > oneMinuteAgo)

    const currentTokens = this.tokens.reduce(
      (sum, entry) => sum + entry.count,
      0
    )
    const currentRequestCount = this.tokens.length

    if (
      this.llmConfig.tpm &&
      currentTokens + estimatedTokens > parseInt(this.llmConfig.tpm, 10)
    ) {
      throw new RateLimitExceededException('tokens')
    }

    if (
      this.llmConfig.rpm &&
      currentRequestCount + 1 > parseInt(this.llmConfig.rpm, 10)
    ) {
      throw new RateLimitExceededException('requests')
    }
  }
}
