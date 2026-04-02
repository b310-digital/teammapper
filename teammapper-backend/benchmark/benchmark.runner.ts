import type { AiService } from '../src/map/services/ai.service'
import { BenchmarkGraderService } from './benchmark-grader.service'
import { BENCHMARK_FIXTURES } from './fixtures'
import type {
  BenchmarkFixture,
  BenchmarkResult,
  GradingReport,
} from './benchmark.types'
import type { LLMProps } from '../src/config.service'
import { SYSTEM_PROMPT } from '../src/map/utils/prompts'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const FIXTURE_DELAY_MS = 2000
const FIXTURE_TIMEOUT_MS = 60_000
const REPORTS_DIR = join(__dirname, 'reports')

export class BenchmarkRunner {
  constructor(
    private readonly aiService: AiService,
    private readonly graderService: BenchmarkGraderService,
    private readonly llmConfig: LLMProps
  ) {}

  async run(): Promise<GradingReport> {
    const results = await this.runAllFixtures()
    const report = this.buildReport(results)
    this.printConsoleReport(report)
    this.writeJsonReport(report)
    return report
  }

  private async runAllFixtures(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = []
    for (let i = 0; i < BENCHMARK_FIXTURES.length; i++) {
      if (i > 0) await this.delay(FIXTURE_DELAY_MS)
      const result = await this.runWithTimeout(BENCHMARK_FIXTURES[i])
      this.printFixtureResult(i, result)
      results.push(result)
    }
    return results
  }

  private runWithTimeout(fixture: BenchmarkFixture): Promise<BenchmarkResult> {
    const timeout = new Promise<BenchmarkResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            fixtureId: fixture.id,
            fixture,
            rawOutput: '',
            error: `timeout after ${FIXTURE_TIMEOUT_MS / 1000}s`,
            durationMs: FIXTURE_TIMEOUT_MS,
            dimensions: [],
          }),
        FIXTURE_TIMEOUT_MS
      )
    )
    return Promise.race([this.runSingleFixture(fixture), timeout])
  }

  private async runSingleFixture(
    fixture: BenchmarkFixture
  ): Promise<BenchmarkResult> {
    const start = Date.now()
    const { rawOutput, error } = await this.executeGeneration(fixture)
    const durationMs = Date.now() - start
    const dimensions = await this.graderService.gradeResult(fixture, rawOutput)
    return {
      fixtureId: fixture.id,
      fixture,
      rawOutput,
      error,
      durationMs,
      dimensions,
    }
  }

  private async executeGeneration(
    fixture: BenchmarkFixture
  ): Promise<{ rawOutput: string; error: string | null }> {
    try {
      const rawOutput = await this.aiService.generateMermaid(
        fixture.mindmapDescription,
        fixture.language
      )
      return { rawOutput, error: null }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      return { rawOutput: '', error }
    }
  }

  private buildReport(results: readonly BenchmarkResult[]): GradingReport {
    const averages = this.calculateAverages(results)
    const allScores = results.flatMap((r) => r.dimensions.map((d) => d.score))
    const overallAverage =
      allScores.length > 0
        ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length
        : 0
    return {
      timestamp: new Date().toISOString(),
      provider: this.llmConfig.provider ?? 'unknown',
      model: this.llmConfig.model ?? 'unknown',
      systemPrompt: SYSTEM_PROMPT,
      results,
      averages,
      overallAverage,
    }
  }

  private calculateAverages(
    results: readonly BenchmarkResult[]
  ): Readonly<Record<string, number>> {
    const dimensionScores: Record<string, number[]> = {}
    for (const result of results) {
      for (const dim of result.dimensions) {
        if (!dimensionScores[dim.name]) dimensionScores[dim.name] = []
        dimensionScores[dim.name].push(dim.score)
      }
    }
    const averages: Record<string, number> = {}
    for (const [name, scores] of Object.entries(dimensionScores)) {
      averages[name] = scores.reduce((sum, s) => sum + s, 0) / scores.length
    }
    return averages
  }

  private printFixtureResult(index: number, result: BenchmarkResult): void {
    const num = String(index + 1).padStart(2, '0')
    const label = result.fixture.id.padEnd(35)
    const dims = result.dimensions
      .map((d) => `${d.name}=${d.score.toFixed(1)}`)
      .join('  ')
    const duration = `${(result.durationMs / 1000).toFixed(1)}s`
    const status = result.error ? '[ERR]' : '[OK]'
    console.log(`[${num}] ${label} ${dims}  ${duration}  ${status}`)
  }

  private printConsoleReport(report: GradingReport): void {
    console.log('\n--- AI Benchmark Report ---')
    console.log(`Date: ${report.timestamp}`)
    const avgEntries = Object.entries(report.averages)
      .map(([name, avg]) => `${name}=${avg.toFixed(1)}`)
      .join('  ')
    console.log(
      `Averages: ${avgEntries}  Overall=${report.overallAverage.toFixed(1)}`
    )
  }

  private writeJsonReport(report: GradingReport): void {
    mkdirSync(REPORTS_DIR, { recursive: true })
    const filename = report.timestamp.replace(/[:.]/g, '-') + '.json'
    const filepath = join(REPORTS_DIR, filename)
    writeFileSync(filepath, JSON.stringify(report, null, 2))
    console.log(`Report written to: ${filepath}`)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
