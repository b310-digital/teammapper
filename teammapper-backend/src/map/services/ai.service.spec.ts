import { jest } from '@jest/globals'

import { AiService, DEFAULT_MAX_OUTPUT_TOKENS } from './ai.service'
import {
  DEFAULT_AI_MAP_SHAPE,
  systemPrompt,
  userPrompt,
} from '../utils/prompts'
import type { LlmUsageCounting } from './llm-usage-counter.service'
import { RateLimitExceededException } from '../controllers/rate-limit.exception'
import { generateText } from 'ai'
import * as aiProvider from '../utils/aiProvider'
import configService from '../../config.service'
import type { LLMProps } from '../../config.service'

type GenerateTextMock = jest.MockedFunction<typeof generateText>
type CreateProviderMock = jest.MockedFunction<typeof aiProvider.createProvider>
type GetLLMConfigMock = jest.MockedFunction<typeof configService.getLLMConfig>

type MockGenerateTextReturn = Awaited<ReturnType<typeof generateText>>

jest.mock('ai')
jest.mock('../utils/aiProvider')
jest.mock('../../config.service')

// One token per character of the prompts sent, plus the full output cap.
const estimateFor = (
  description: string,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS
) =>
  systemPrompt(DEFAULT_AI_MAP_SHAPE).length +
  userPrompt(description, 'en').length +
  maxOutputTokens

interface FakeUsageState {
  tokensUsed: number
  requestsCount: number
}

const buildUsageCounterMock = (
  state: FakeUsageState
): jest.Mocked<LlmUsageCounting> => ({
  reserve: jest.fn(async (_dateUsage: string, tokens: number, cap?: number) => {
    const proposed = state.tokensUsed + tokens
    if (cap !== undefined && proposed > cap) return null
    state.tokensUsed = proposed
    state.requestsCount += 1
    return {
      tokensUsed: state.tokensUsed,
      requestsCount: state.requestsCount,
    }
  }),
  adjustTokens: jest.fn(async (_dateUsage: string, delta: number) => {
    state.tokensUsed = Math.max(0, state.tokensUsed + delta)
  }),
})

describe('AiService', () => {
  let aiService: AiService
  let generateTextMock: GenerateTextMock
  let createProviderMock: CreateProviderMock
  let getLLMConfigMock: GetLLMConfigMock
  let usageState: FakeUsageState
  let usageCounter: jest.Mocked<LlmUsageCounting>

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true })
  })

  beforeEach(() => {
    jest.clearAllMocks()

    generateTextMock = generateText as GenerateTextMock
    createProviderMock = aiProvider.createProvider as CreateProviderMock
    getLLMConfigMock = configService.getLLMConfig as GetLLMConfigMock

    generateTextMock.mockResolvedValue({
      text: 'mermaid graph',
      usage: {
        inputTokens: 100,
        outputTokens: 400,
        totalTokens: 500,
      },
    } as MockGenerateTextReturn)

    createProviderMock.mockReturnValue(
      (() => 'mocked-model') as unknown as ReturnType<
        typeof aiProvider.createProvider
      >
    )

    getLLMConfigMock.mockReturnValue({
      url: 'localhost:3000',
      token: 'test-token',
      provider: 'openai',
      model: 'gpt-4',
      tpm: '10000',
      rpm: '5',
      tpd: '100000',
    } satisfies LLMProps)

    usageState = { tokensUsed: 0, requestsCount: 0 }
    usageCounter = buildUsageCounterMock(usageState)
    aiService = new AiService(usageCounter)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  describe('token estimate', () => {
    const reserved = () => usageCounter.reserve.mock.calls[0][1]

    it('counts every character of both prompts plus the output cap', async () => {
      await aiService.generateMermaid('hello', 'en')

      expect(reserved()).toBe(estimateFor('hello'))
    })

    it('reserves the full configured output cap', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        maxOutputTokens: '1000',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      await aiService.generateMermaid('hello', 'en')

      expect(reserved()).toBe(estimateFor('hello', 1000))
    })

    it('falls back to the default output cap when the configured one is 0', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        maxOutputTokens: '0',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      await aiService.generateMermaid('hello', 'en')

      expect(reserved()).toBe(estimateFor('hello'))
    })
  })

  describe('generateMermaid', () => {
    it('forwards prompt with language tag and abort signal to generateText', async () => {
      await aiService.generateMermaid('create a mindmap', 'en')

      expect(generateTextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: '<topic lang="en">create a mindmap</topic>',
          abortSignal: expect.any(AbortSignal),
        })
      )
    })

    it('writes a given map shape into the system prompt', async () => {
      await aiService.generateMermaid('create a mindmap', 'en', {
        levels: 3,
        childrenPerNode: 1,
      })

      const { system } = generateTextMock.mock.calls[0][0]
      expect(system).toContain('exactly 3 levels')
      expect(system).toContain('no more than 1 child nodes')
    })

    it('shows the same example for every map shape', async () => {
      await aiService.generateMermaid('create a mindmap', 'en', {
        levels: 1,
        childrenPerNode: 1,
      })
      await aiService.generateMermaid('create a mindmap', 'en', {
        levels: 3,
        childrenPerNode: 2,
      })

      const example = (call: number) =>
        String(generateTextMock.mock.calls[call][0].system).match(
          /<example>[\s\S]*<\/example>/
        )?.[0]
      expect(example(0)).toContain('Subtopic A')
      expect(example(0)).toBe(example(1))
    })

    it('drops the nodes that exceed the requested shape', async () => {
      generateTextMock.mockResolvedValueOnce({
        text: 'mindmap\n  Root\n    A\n      A1\n    B\n    C',
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      } as MockGenerateTextReturn)

      const result = await aiService.generateMermaid('create a mindmap', 'en', {
        levels: 1,
        childrenPerNode: 2,
      })

      expect(result.mermaid).toBe('mindmap\n  Root\n    A\n    B')
    })

    it('flags the result as truncated when the LLM hits the token cap', async () => {
      generateTextMock.mockResolvedValueOnce({
        text: 'mindmap',
        finishReason: 'length',
        usage: { inputTokens: 100, outputTokens: 400, totalTokens: 500 },
      } as MockGenerateTextReturn)

      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toEqual({ mermaid: 'mindmap', truncated: true })
    })

    it('forwards configured maxOutputTokens to generateText', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        maxOutputTokens: '256',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      await aiService.generateMermaid('hi', 'en')

      expect(generateTextMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxOutputTokens: 256 })
      )
    })

    it('leaves a reasoning model room to think when no cap is configured', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai-compatible',
        model: 'qwen3',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      await aiService.generateMermaid('hi', 'en')

      expect(generateTextMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS })
      )
    })

    it('returns empty mermaid when provider is not configured', async () => {
      createProviderMock.mockReturnValueOnce(undefined)

      aiService = new AiService(usageCounter)
      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toEqual({ mermaid: '', truncated: false })
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('returns empty mermaid when model is not configured', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: undefined,
        tpm: '1000',
        rpm: '5',
        tpd: '10000',
      } satisfies LLMProps)

      aiService = new AiService(usageCounter)
      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toEqual({ mermaid: '', truncated: false })
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('rejects atomically when TPD would be exceeded (no row written)', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: String(estimateFor('short') + 50),
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      // The first call fits and bills 100 tokens
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      // Second call estimate + already-billed (100) exceeds the cap -> reject
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )

      // No reservation was created for the rejected call, so totals reflect
      // only the first call's actual (100) and one request.
      expect(usageState).toEqual({ tokensUsed: 100, requestsCount: 1 })
    })

    it('allows a reservation that lands exactly at the TPD cap', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: String(estimateFor('short')),
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      // The estimate equals the cap, so this must succeed.
      await aiService.generateMermaid('short', 'en')
      expect(usageCounter.reserve).toHaveBeenCalledWith(
        expect.any(String),
        estimateFor('short'),
        estimateFor('short')
      )
    })

    it('rejects every call when TPD is 0', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: '0',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('rejects every call when TPM is 0', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '0',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('reconciles billed tokens via adjustTokens with the correct delta', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      generateTextMock.mockResolvedValueOnce({
        text: 'response',
        usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      expect(usageCounter.adjustTokens).toHaveBeenCalledWith(
        expect.any(String),
        100 - estimateFor('short')
      )
    })

    it('keeps the estimate when the provider reports no usage', async () => {
      generateTextMock.mockResolvedValueOnce({
        text: 'response',
        usage: {},
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      expect(usageState.tokensUsed).toBe(estimateFor('short'))
    })

    it('keeps the conservative reservation when adjustTokens fails after a successful LLM call', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)
      usageCounter.adjustTokens.mockRejectedValueOnce(new Error('db hiccup'))

      // Reconciliation failure must not propagate.
      await aiService.generateMermaid('short', 'en')
      // Reservation persists at the conservative estimate, not actual.
      expect(usageState.tokensUsed).toBe(estimateFor('short'))
    })

    it('keeps the estimate booked when generateText fails', async () => {
      generateTextMock.mockRejectedValueOnce(new Error('boom'))
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        'boom'
      )

      // The provider may have billed the failed call.
      expect(usageState).toEqual({
        tokensUsed: estimateFor('short'),
        requestsCount: 1,
      })
    })

    it('throws an error if the tokens per minute limit is reached', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(estimateFor('short') + 500),
        rpm: undefined,
        tpd: undefined,
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: {
          inputTokens: 300,
          outputTokens: 500,
          totalTokens: 800,
        },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )
    })

    it('throws an error if the requests per minute limit is reached', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: undefined,
        rpm: '3',
        tpd: undefined,
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      for (let i = 0; i < 3; i++) {
        await aiService.generateMermaid(`request ${i}`, 'en')
      }

      await expect(
        aiService.generateMermaid('fourth request', 'en')
      ).rejects.toThrow(RateLimitExceededException)
      await expect(
        aiService.generateMermaid('fourth request', 'en')
      ).rejects.toThrow('Request limit exceeded.')
    })

    it('reserves tokens before generateText so concurrent callers see the precharge', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(2 * estimateFor('short') - 1),
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      // Both calls together need two estimates reserved up-front; with a TPM
      // one below that, only the first should succeed.
      let release!: () => void
      const block = new Promise<void>((resolve) => {
        release = resolve
      })
      generateTextMock.mockImplementationOnce((async () => {
        await block
        return {
          text: 'slow',
          usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
        }
      }) as unknown as typeof generateText)

      const first = aiService.generateMermaid('short', 'en')
      // Second call must observe first's pre-charge already in the per-minute
      // window, blocking it instead of racing through the precheck.
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )
      release()
      await first
    })

    it('counts a failed call against the per-minute limits', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        rpm: '1',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      generateTextMock.mockRejectedValueOnce(new Error('boom'))
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        'boom'
      )

      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )
    })

    it('resets token count after one minute', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(estimateFor('short') + 500),
        rpm: undefined,
        tpd: undefined,
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: {
          inputTokens: 300,
          outputTokens: 500,
          totalTokens: 800,
        },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )

      jest.advanceTimersByTime(61000)

      await aiService.generateMermaid('short', 'en')
    })

    it('uses input length for token estimation in rate limiting', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(estimateFor('') + 1000),
        rpm: undefined,
        tpd: undefined,
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      const longInput = 'a'.repeat(2000)
      await expect(aiService.generateMermaid(longInput, 'en')).rejects.toThrow(
        RateLimitExceededException
      )
    })
  })
})
