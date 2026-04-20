import type { SupportedLanguage } from '../src/map/utils/prompts'

export type FixtureTopic =
  | 'informational'
  | 'creative'
  | 'technical'
  | 'edge-case'

export interface BenchmarkFixture {
  readonly id: string
  readonly description: string
  readonly mindmapDescription: string
  readonly language: SupportedLanguage
  readonly topic: FixtureTopic
}

export interface GradingDimension {
  readonly name: string
  readonly score: number
  readonly strengths: string
  readonly weaknesses: string
}

export interface BenchmarkResult {
  readonly fixtureId: string
  readonly fixture: BenchmarkFixture
  readonly rawOutput: string
  readonly durationMs: number
  readonly error: string | null
  readonly dimensions: readonly GradingDimension[]
}

export interface GradingReport {
  readonly timestamp: string
  readonly provider: string
  readonly model: string
  readonly systemPrompt: string
  readonly results: readonly BenchmarkResult[]
  readonly averages: Readonly<Record<string, number>>
  readonly overallAverage: number
}
