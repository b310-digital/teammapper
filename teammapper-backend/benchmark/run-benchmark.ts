import { BenchmarkGraderService } from './benchmark-grader.service'
import { BenchmarkRunner } from './benchmark.runner'

async function main(): Promise<void> {
  // Dynamic imports — run after process.env is set above
  const { AiService } = await import('../src/map/services/ai.service')
  const { default: configService } = await import('../src/config.service')

  const llmConfig = configService.getLLMConfig()
  if (!llmConfig.token || !llmConfig.model) {
    console.error('Error: AI_LLM_TOKEN and AI_LLM_MODEL must be set')
    process.exit(1)
  }

  const aiService = new AiService()
  const graderService = new BenchmarkGraderService({ llmConfig })
  const runner = new BenchmarkRunner(aiService, graderService, llmConfig)

  await runner.run()
}

main().catch((err: unknown) => {
  console.error('Benchmark failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
