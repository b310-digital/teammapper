import { jest } from '@jest/globals'
import { BenchmarkGraderService } from './benchmark-grader.service'
import { generateText } from 'ai'
import * as aiProvider from '../src/map/utils/aiProvider'
import type { LLMProps } from '../src/config.service'
import type { BenchmarkFixture } from './benchmark.types'

type GenerateTextMock = jest.MockedFunction<typeof generateText>
type CreateProviderMock = jest.MockedFunction<typeof aiProvider.createProvider>
type MockGenerateTextReturn = Awaited<ReturnType<typeof generateText>>

jest.mock('ai')
jest.mock('../src/map/utils/aiProvider')

const llmConfig: LLMProps = {
  token: 'test-token',
  provider: 'openai',
  model: 'gpt-4',
}

const VALID_14_NODE_MINDMAP = `mindmap
  Photosynthesis
    Light Reactions
      Chlorophyll
      ATP Production
    Dark Reactions
      Carbon Fixation
      Sugar Formation
    Inputs
      Water
      Carbon Dioxide
      Sunlight
    Outputs
      Oxygen
      Glucose`

const fixture: BenchmarkFixture = {
  id: 'test-fixture',
  description: 'Test fixture for photosynthesis',
  mindmapDescription: 'Photosynthesis process in plants',
  language: 'en',
  topic: 'informational',
}

const VALID_GRADING_RESPONSE =
  '{"score": 8, "strengths": "Relevant", "weaknesses": "Shallow"}'

describe('BenchmarkGraderService', () => {
  let grader: BenchmarkGraderService
  let generateTextMock: GenerateTextMock
  let createProviderMock: CreateProviderMock

  beforeEach(() => {
    jest.clearAllMocks()

    generateTextMock = generateText as GenerateTextMock
    createProviderMock = aiProvider.createProvider as CreateProviderMock

    generateTextMock.mockResolvedValue({
      text: VALID_GRADING_RESPONSE,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as MockGenerateTextReturn)

    createProviderMock.mockReturnValue(
      (() => 'mocked-model') as unknown as ReturnType<
        typeof aiProvider.createProvider
      >
    )

    grader = new BenchmarkGraderService({ llmConfig })
  })

  describe('gradeResult', () => {
    it('returns an array of 2 dimensions', async () => {
      const dimensions = await grader.gradeResult(
        fixture,
        VALID_14_NODE_MINDMAP
      )
      expect(dimensions).toHaveLength(2)
    })

    it('first dimension name is Semantic Quality', async () => {
      const dimensions = await grader.gradeResult(
        fixture,
        VALID_14_NODE_MINDMAP
      )
      expect(dimensions[0].name).toBe('Semantic Quality')
    })

    it('second dimension name is Mermaid Syntax', async () => {
      const dimensions = await grader.gradeResult(
        fixture,
        VALID_14_NODE_MINDMAP
      )
      expect(dimensions[1].name).toBe('Mermaid Syntax')
    })
  })

  describe('semantic dimension', () => {
    it('parses score from valid LLM JSON response', async () => {
      generateTextMock.mockResolvedValue({
        text: '{"score": 8, "strengths": "Relevant", "weaknesses": "Shallow"}',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      } as MockGenerateTextReturn)

      const dimensions = await grader.gradeResult(
        fixture,
        VALID_14_NODE_MINDMAP
      )
      expect(dimensions[0].score).toBe(8)
    })

    it('falls back to grading failed message when LLM returns non-JSON on all attempts', async () => {
      generateTextMock.mockResolvedValue({
        text: 'not json at all',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      } as MockGenerateTextReturn)

      const dimensions = await grader.gradeResult(
        fixture,
        VALID_14_NODE_MINDMAP
      )
      expect(dimensions[0].weaknesses).toBe(
        'grading failed — unparseable response'
      )
    })

    it('grading prompt includes the fixture mindmapDescription', async () => {
      await grader.gradeResult(fixture, VALID_14_NODE_MINDMAP)
      const firstCallArg = generateTextMock.mock.calls[0][0] as {
        prompt?: string
      }
      expect(firstCallArg.prompt).toContain(fixture.mindmapDescription)
    })
  })

  describe('syntax dimension', () => {
    it('scores 10 for a valid 14-node mindmap with no errors or warnings', async () => {
      const dimensions = await grader.gradeResult(
        fixture,
        VALID_14_NODE_MINDMAP
      )
      expect(dimensions[1].score).toBe(10)
    })

    it('scores 0 for empty string output', async () => {
      const dimensions = await grader.gradeResult(fixture, '')
      expect(dimensions[1].score).toBe(0)
    })

    it('scores less than 4 for invalid mindmap without mindmap keyword', async () => {
      const dimensions = await grader.gradeResult(fixture, 'Root\n  Child')
      expect(dimensions[1].score).toBeLessThan(4)
    })
  })
})
