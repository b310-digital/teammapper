import { jest } from '@jest/globals'

import { AiService } from './ai.service'
import { RateLimitExceededException } from '../controllers/rate-limit.exception'
import { generateText } from 'ai'
import * as aiProvider from '../utils/aiProvider'
import configService from '../../config.service'
import type { LLMProps } from '../../config.service'

// Define proper mock types based on actual function signatures
type GenerateTextMock = jest.MockedFunction<typeof generateText>
type CreateProviderMock = jest.MockedFunction<typeof aiProvider.createProvider>
type GetLLMConfigMock = jest.MockedFunction<typeof configService.getLLMConfig>

// Define the actual return type we need
type MockGenerateTextReturn = Awaited<ReturnType<typeof generateText>>

jest.mock('ai')
jest.mock('../utils/aiProvider')
jest.mock('../../config.service')

describe('AiService', () => {
  let aiService: AiService
  let generateTextMock: GenerateTextMock
  let createProviderMock: CreateProviderMock
  let getLLMConfigMock: GetLLMConfigMock

  beforeAll(async () => {
    // Calling advanceTimers here is very important, as otherwise async ops like await will hang indefinitely
    // Ref: https://jestjs.io/docs/jest-object#jestusefaketimersfaketimersconfig
    jest.useFakeTimers({ advanceTimers: true })
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up mocks with proper type assertions
    generateTextMock = generateText as GenerateTextMock
    createProviderMock = aiProvider.createProvider as CreateProviderMock
    getLLMConfigMock = configService.getLLMConfig as GetLLMConfigMock

    // Default mock implementations with proper types
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

    aiService = new AiService()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  describe('estimateTokens', () => {
    it('estimates tokens for short input', () => {
      expect(aiService.estimateTokens('hello')).toBe(Math.ceil(5 / 4) + 200)
    })

    it('estimates tokens for long input', () => {
      const input = 'a'.repeat(4000)
      expect(aiService.estimateTokens(input)).toBe(Math.ceil(4000 / 4) + 200)
    })

    it('estimates tokens for empty input', () => {
      expect(aiService.estimateTokens('')).toBe(200)
    })

    it('estimates tokens for CJK characters', () => {
      const input = '\u4f60\u597d\u4e16\u754c'
      expect(aiService.estimateTokens(input)).toBe(Math.ceil(4 / 4) + 200)
    })
  })

  describe('generateMermaid', () => {
    it('calls the generateText functionality', async () => {
      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toBe('mermaid graph')
      expect(generateTextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt:
            'Create a mindmap in language code en about: create a mindmap',
        })
      )
    })

    it('returns empty string when provider is not configured', async () => {
      createProviderMock.mockReturnValueOnce(undefined)

      aiService = new AiService()
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

      aiService = new AiService()
      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toBe('')
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('throws an error if the tokens per day limit is reached', async () => {
      // estimateTokens('short') = ceil(5/4) + 200 = 202
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: undefined,
        rpm: undefined,
        tpd: '1000',
      } satisfies LLMProps)

      aiService = new AiService()

      // First request uses 800 tokens (tracked after call)
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: {
          inputTokens: 300,
          outputTokens: 500,
          totalTokens: 800,
        },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      // Second request: daily total is 800, estimated ~202, total 1002 > 1000
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )
    })

    it('throws an error if the tokens per minute limit is reached', async () => {
      // estimateTokens('short') = ceil(5/4) + 200 = 202
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '1000',
        rpm: undefined,
        tpd: undefined,
      } satisfies LLMProps)

      aiService = new AiService()

      // First request uses 800 tokens
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: {
          inputTokens: 300,
          outputTokens: 500,
          totalTokens: 800,
        },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      // Second request: 800 tracked + 202 estimated = 1002 > 1000
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

      aiService = new AiService()

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        generateTextMock.mockResolvedValueOnce({
          text: `response ${i}`,
          usage: {
            inputTokens: 20,
            outputTokens: 80,
            totalTokens: 100,
          },
        } as MockGenerateTextReturn)
        await aiService.generateMermaid(`request ${i}`, 'en')
      }

      // Fourth request should fail (exceeds 3 requests per minute)
      await expect(
        aiService.generateMermaid('fourth request', 'en')
      ).rejects.toThrow(RateLimitExceededException)
      await expect(
        aiService.generateMermaid('fourth request', 'en')
      ).rejects.toThrow('Request limit exceeded.')
    })

    it('resets token count after one minute', async () => {
      // estimateTokens('short') = 202
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '1000',
        rpm: undefined,
        tpd: undefined,
      } satisfies LLMProps)

      aiService = new AiService()

      // First request uses 800 tokens
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: {
          inputTokens: 300,
          outputTokens: 500,
          totalTokens: 800,
        },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      // Second request would exceed limit (800 + 202 > 1000)
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )

      // Advance time by more than 1 minute
      jest.advanceTimersByTime(61000)

      // Now the request should succeed since the minute has passed
      generateTextMock.mockResolvedValueOnce({
        text: 'second response',
        usage: {
          inputTokens: 100,
          outputTokens: 300,
          totalTokens: 400,
        },
      } as MockGenerateTextReturn)
      const result = await aiService.generateMermaid('short', 'en')
      expect(result).toBe('second response')
    })

    it('resets daily token count when date changes', async () => {
      // estimateTokens('short') = 202
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: undefined,
        rpm: undefined,
        tpd: '1000',
      } satisfies LLMProps)

      aiService = new AiService()

      // Use up most of the daily limit
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: {
          inputTokens: 300,
          outputTokens: 500,
          totalTokens: 800,
        },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('short', 'en')

      // Second request would exceed daily limit (800 + 202 > 1000)
      await expect(aiService.generateMermaid('short', 'en')).rejects.toThrow(
        RateLimitExceededException
      )

      // Mock date change to next day
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      jest.setSystemTime(tomorrow)

      // Now the request should succeed with reset daily counter
      generateTextMock.mockResolvedValueOnce({
        text: 'second response',
        usage: {
          inputTokens: 100,
          outputTokens: 400,
          totalTokens: 500,
        },
      } as MockGenerateTextReturn)
      const result = await aiService.generateMermaid('short', 'en')
      expect(result).toBe('second response')
    })

    it('handles multiple rate limits simultaneously', async () => {
      // estimateTokens('request N') = ceil(9/4) + 200 = 203
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '5000',
        rpm: '5',
        tpd: '5000',
      } satisfies LLMProps)

      aiService = new AiService()

      // Make 4 requests, each using 400 tokens (total 1600 tokens, 4 requests)
      for (let i = 0; i < 4; i++) {
        generateTextMock.mockResolvedValueOnce({
          text: `response ${i}`,
          usage: {
            inputTokens: 100,
            outputTokens: 300,
            totalTokens: 400,
          },
        } as MockGenerateTextReturn)
        await aiService.generateMermaid(`request ${i}`, 'en')
      }

      // 5th request should succeed (1600 + 203 = 1803 < 5000)
      generateTextMock.mockResolvedValueOnce({
        text: 'fifth response',
        usage: {
          inputTokens: 50,
          outputTokens: 250,
          totalTokens: 300,
        },
      } as MockGenerateTextReturn)
      await aiService.generateMermaid('fifth req', 'en')

      // 6th request should fail due to RPM limit (6 > 5)
      await expect(
        aiService.generateMermaid('sixth req', 'en')
      ).rejects.toThrow('Request limit exceeded.')
    })

    it('uses input length for token estimation in rate limiting', async () => {
      // A long input (2000 chars) should estimate ~700 tokens (2000/4 + 200)
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '600',
        rpm: undefined,
        tpd: undefined,
      } satisfies LLMProps)

      aiService = new AiService()

      const longInput = 'a'.repeat(2000)
      // estimateTokens = ceil(2000/4) + 200 = 700 > tpm of 600
      await expect(aiService.generateMermaid(longInput, 'en')).rejects.toThrow(
        RateLimitExceededException
      )
    })
  })
})
