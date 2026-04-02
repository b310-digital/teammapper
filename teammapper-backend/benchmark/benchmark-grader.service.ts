import type { LLMProps } from '../src/config.service'
import { createProvider } from '../src/map/utils/aiProvider'
import { generateText } from 'ai'
import { validateMermaidMindmap } from './mermaid-syntax-validator'
import type { BenchmarkFixture, GradingDimension } from './benchmark.types'

const SEMANTIC_DIMENSION_NAME = 'Semantic Quality'
const SYNTAX_DIMENSION_NAME = 'Mermaid Syntax'

const GRADING_SYSTEM_PROMPT = `You are a benchmark grader for a mindmap generation AI.
Evaluate the output and return ONLY a JSON object (no markdown code fences, no extra text):

{"score": <0-10>, "strengths": "<one sentence>", "weaknesses": "<one sentence>"}

Scoring rubric:
- 9-10: Rich, relevant, well-structured mindmap with 10-20 nodes on the correct topic
- 7-8: Relevant mindmap but missing depth or breadth, or exceeds 20 nodes (too verbose)
- 4-6: Partially relevant or shallow
- 1-3: Mostly irrelevant to the requested topic
- 0: Empty output`

export class BenchmarkGraderService {
  constructor(private readonly config: { readonly llmConfig: LLMProps }) {}

  async gradeResult(
    fixture: BenchmarkFixture,
    rawOutput: string
  ): Promise<readonly GradingDimension[]> {
    const [semantic, syntax] = await Promise.all([
      this.gradeSemanticQuality(fixture, rawOutput),
      Promise.resolve(this.gradeMermaidSyntax(rawOutput)),
    ])
    return [semantic, syntax]
  }

  private async gradeSemanticQuality(
    fixture: BenchmarkFixture,
    rawOutput: string
  ): Promise<GradingDimension> {
    const { score, strengths, weaknesses } = await this.gradeSemanticWithRetry(
      fixture,
      rawOutput
    )
    return { name: SEMANTIC_DIMENSION_NAME, score, strengths, weaknesses }
  }

  private async gradeSemanticWithRetry(
    fixture: BenchmarkFixture,
    rawOutput: string
  ): Promise<{ score: number; strengths: string; weaknesses: string }> {
    const prompt = this.buildGradingUserPrompt(fixture, rawOutput)
    const text = await this.callGradingLLM(prompt)
    const result = this.parseGradingJson(text)
    if (result !== null) return result

    const retryText = await this.callGradingLLM(
      `${prompt}\nIMPORTANT: Respond ONLY with valid JSON.`
    )
    return (
      this.parseGradingJson(retryText) ?? {
        score: 0,
        strengths: '',
        weaknesses: 'grading failed — unparseable response',
      }
    )
  }

  private async callGradingLLM(userPrompt: string): Promise<string> {
    const provider = createProvider(this.config.llmConfig)
    if (!provider || !this.config.llmConfig.model) return ''

    const { text } = await generateText({
      model: provider(this.config.llmConfig.model),
      system: GRADING_SYSTEM_PROMPT,
      prompt: userPrompt,
    })
    return text
  }

  private stripMarkdownFences(text: string): string {
    return text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
  }

  private parseGradingJson(
    text: string
  ): { score: number; strengths: string; weaknesses: string } | null {
    try {
      const stripped = this.stripMarkdownFences(text)
      const parsed: unknown = JSON.parse(stripped)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).score !== 'number' ||
        typeof (parsed as Record<string, unknown>).strengths !== 'string' ||
        typeof (parsed as Record<string, unknown>).weaknesses !== 'string'
      ) {
        return null
      }
      const obj = parsed as {
        score: number
        strengths: string
        weaknesses: string
      }
      return { ...obj, score: Math.min(10, Math.max(0, obj.score)) }
    } catch {
      return null
    }
  }

  private buildGradingUserPrompt(
    fixture: BenchmarkFixture,
    rawOutput: string
  ): string {
    return `Topic requested: ${fixture.mindmapDescription}\nLanguage: ${fixture.language}\nOutput to grade:\n${rawOutput || '(empty)'}`
  }

  private gradeMermaidSyntax(rawOutput: string): GradingDimension {
    const validation = validateMermaidMindmap(rawOutput)
    return {
      name: SYNTAX_DIMENSION_NAME,
      score: this.calculateSyntaxScore(validation),
      strengths: this.buildSyntaxStrengths(validation),
      weaknesses: this.buildSyntaxWeaknesses(validation),
    }
  }

  private calculateSyntaxScore(
    validation: ReturnType<typeof validateMermaidMindmap>
  ): number {
    if (validation.isEmpty) return 0
    if (!validation.isValid) return 2
    const base =
      validation.nodeCount >= 10 ? 10 : validation.nodeCount >= 5 ? 7 : 4
    return Math.max(
      0,
      base - validation.errors.length * 2 - validation.warnings.length
    )
  }

  private buildSyntaxStrengths(
    validation: ReturnType<typeof validateMermaidMindmap>
  ): string {
    if (validation.isEmpty || !validation.isValid) return ''
    if (validation.warnings.length === 0) {
      return `Valid Mermaid mindmap syntax with ${validation.nodeCount} nodes`
    }
    return `Parseable structure with ${validation.nodeCount} nodes`
  }

  private buildSyntaxWeaknesses(
    validation: ReturnType<typeof validateMermaidMindmap>
  ): string {
    if (validation.isEmpty) return 'Empty output'
    return [...validation.errors, ...validation.warnings].join('; ')
  }
}
