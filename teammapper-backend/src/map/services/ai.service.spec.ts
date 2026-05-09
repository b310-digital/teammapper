import { jest } from '@jest/globals'

import { AiService, SYSTEM_PROMPT_TOKEN_OVERHEAD } from './ai.service'
import { LlmUsageCounterService } from './llm-usage-counter.service'
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

interface FakeUsageState {
  tokensUsed: number
  requestsCount: number
}

const buildUsageCounterMock = (state: FakeUsageState) =>
  ({
    reserve: jest.fn(
      async (_dateUsage: string, tokens: number, cap?: number) => {
        const proposed = state.tokensUsed + tokens
        if (cap !== undefined && proposed > cap) return null
        state.tokensUsed = proposed
        state.requestsCount += 1
        return {
          tokensUsed: state.tokensUsed,
          requestsCount: state.requestsCount,
        }
      }
    ),
    adjustTokens: jest.fn(async (_dateUsage: string, delta: number) => {
      state.tokensUsed = Math.max(0, state.tokensUsed + delta)
    }),
    release: jest.fn(async (_dateUsage: string, tokens: number) => {
      state.tokensUsed = Math.max(0, state.tokensUsed - tokens)
      state.requestsCount = Math.max(0, state.requestsCount - 1)
    }),
  }) as unknown as LlmUsageCounterService

describe('AiService', () => {
  let aiService: AiService
  let generateTextMock: GenerateTextMock
  let createProviderMock: CreateProviderMock
  let getLLMConfigMock: GetLLMConfigMock
  let usageState: FakeUsageState
  let usageCounter: LlmUsageCounterService

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
      tpm: '1000',
      rpm: '5',
      tpd: '10000',
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

  describe('estimateTokens', () => {
    it('estimates tokens for short input', () => {
      expect(aiService.estimateTokens('hello')).toBe(
        Math.ceil(5 / 4) + SYSTEM_PROMPT_TOKEN_OVERHEAD
      )
    })

    it('estimates tokens for empty input', () => {
      expect(aiService.estimateTokens('')).toBe(SYSTEM_PROMPT_TOKEN_OVERHEAD)
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

    it('returns empty string when provider is not configured', async () => {
      createProviderMock.mockReturnValueOnce(undefined)

      aiService = new AiService(usageCounter)
      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toBe('')
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('returns empty string when model is not configured', async () => {
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

      expect(result).toBe('')
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('rejects atomically when TPD would be exceeded (no row written)', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: '300',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      // estimateTokens('short') = 202; first call is fine and bills 100 tokens
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      // Second call estimate (202) + already-billed (100) = 302 > 300 -> reject
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )

      // No reservation was created for the rejected call, so totals reflect
      // only the first call's actual (100) and one request — and no rollback.
      const releaseMock = usageCounter.release as jest.MockedFunction<
        typeof usageCounter.release
      >
      expect({
        ...usageState,
        releaseCalls: releaseMock.mock.calls.length,
      }).toEqual({
        tokensUsed: 100,
        requestsCount: 1,
        releaseCalls: 0,
      })
    })

    it('allows a reservation that lands exactly at the TPD cap', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: '202',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      // estimateTokens('short') = 202; equal to the cap, so this must succeed.
      await aiService.generateMermaid('short', 'en')
      expect(usageCounter.reserve).toHaveBeenCalledWith(
        expect.any(String),
        202,
        202
      )
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

      // estimated = 202, actual = 100 -> delta = -102
      expect(usageCounter.adjustTokens).toHaveBeenCalledWith(
        expect.any(String),
        -102
      )
    })

    it('keeps the conservative reservation when adjustTokens fails after a successful LLM call', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)
      ;(
        usageCounter.adjustTokens as jest.MockedFunction<
          typeof usageCounter.adjustTokens
        >
      ).mockRejectedValueOnce(new Error('db hiccup'))

      // Reconciliation failure must not propagate, must not release.
      await aiService.generateMermaid('short', 'en')
      expect(usageCounter.release).not.toHaveBeenCalled()
      // Reservation persists at the conservative estimate (202), not actual.
      expect(usageState.tokensUsed).toBe(202)
    })

    it('does not mask the original LLM error when release fails during rollback', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)
      ;(
        usageCounter.release as jest.MockedFunction<typeof usageCounter.release>
      ).mockRejectedValueOnce(new Error('db unreachable'))

      generateTextMock.mockRejectedValueOnce(new Error('boom'))
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        'boom'
      )
    })

    it('throws an error if the tokens per minute limit is reached', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '1000',
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
        tpm: '500',
      } satisfies LLMProps)
      aiService = new AiService(usageCounter)

      // estimateTokens('short') = 202. Two concurrent calls would need 404 reserved
      // up-front; with TPM=500, only the first should succeed.
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
      // Second call must observe first's pre-charge of 202 already in the
      // per-minute window, blocking it instead of racing through the precheck.
      await expect(
        aiService.generateMermaid('s'.repeat(1200), 'en')
      ).rejects.toThrow(RateLimitExceededException)
      release()
      await first
    })

    it('releases the per-minute reservation when generateText fails', async () => {
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

      // After release, RPM=1 should still allow one more call.
      await aiService.generateMermaid('short', 'en')
    })

    it('resets token count after one minute', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '1000',
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
        tpm: '600',
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
