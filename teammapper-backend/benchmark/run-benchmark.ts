import { BenchmarkGraderService } from './benchmark-grader.service'
import { BenchmarkRunner } from './benchmark.runner'
import type { LlmUsageCounting } from '../src/map/services/llm-usage-counter.service'

/**
 * The benchmark runs without a database, so it keeps the daily totals in
 * memory. Nothing enforces a cap here: the run is deliberate and bounded by
 * the fixture list.
 */
class InMemoryUsageCounter implements LlmUsageCounting {
  private tokensUsed = 0
  private requestsCount = 0

  async reserve(
    _dateUsage: string,
    tokens: number
  ): Promise<{ tokensUsed: number; requestsCount: number }> {
    this.tokensUsed += tokens
    this.requestsCount += 1
    return { tokensUsed: this.tokensUsed, requestsCount: this.requestsCount }
  }

  async adjustTokens(_dateUsage: string, delta: number): Promise<void> {
    this.tokensUsed = Math.max(0, this.tokensUsed + delta)
  }

  async release(_dateUsage: string, tokens: number): Promise<void> {
    this.tokensUsed = Math.max(0, this.tokensUsed - tokens)
    this.requestsCount = Math.max(0, this.requestsCount - 1)
  }
}

async function main(): Promise<void> {
  // Dynamic imports — run after process.env is set above
  const { AiService } = await import('../src/map/services/ai.service')
  const { default: configService } = await import('../src/config.service')

  const llmConfig = configService.getLLMConfig()
  if (!llmConfig.token || !llmConfig.model) {
    console.error('Error: AI_LLM_TOKEN and AI_LLM_MODEL must be set')
    process.exit(1)
  }

  const aiService = new AiService(new InMemoryUsageCounter())
  const graderService = new BenchmarkGraderService({ llmConfig })
  const runner = new BenchmarkRunner(aiService, graderService, llmConfig)

  await runner.run()
}

main().catch((err: unknown) => {
  console.error('Benchmark failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
