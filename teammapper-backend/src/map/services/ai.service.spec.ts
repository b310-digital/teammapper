import { jest } from '@jest/globals'

// Mock modules before any imports
jest.mock('ai')
jest.mock('../utils/aiProvider')
jest.mock('../../config.service')

import { AiService } from './ai.service'
import { RateLimitExceededException } from '../controllers/rate-limit.exception'
import * as ai from 'ai'
import * as aiProvider from '../utils/aiProvider'
import configService from '../../config.service'
import type { LLMProps } from '../../config.service'

describe('AiService', () => {
  let aiService: AiService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let generateTextMock: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createProviderMock: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getLLMConfigMock: any

  beforeAll(async () => {
    // Calling advanceTimers here is very important, as otherwise async ops like await will hang indefinitely
    // Ref: https://jestjs.io/docs/jest-object#jestusefaketimersfaketimersconfig
    jest.useFakeTimers({ advanceTimers: true })
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up mocks
    generateTextMock = ai.generateText
    createProviderMock = aiProvider.createProvider
    getLLMConfigMock = configService.getLLMConfig

    // Default mock implementations
    generateTextMock.mockResolvedValue({
      text: 'mermaid graph',
      usage: { totalTokens: 500 },
    })

    createProviderMock.mockReturnValue(() => 'mocked-model')

    getLLMConfigMock.mockReturnValue({
      url: 'localhost:3000',
      token: 'test-token',
      provider: 'openai',
      model: 'gpt-4',
      tpm: '1000',
      rpm: '5',
      tpd: '10000',
    } as LLMProps)

    aiService = new AiService()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  describe('generateMermaid', () => {
    it('generates mermaid syntax successfully', async () => {
      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toBe('mermaid graph')
      expect(generateTextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'create a mindmap',
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
      } as LLMProps)

      aiService = new AiService()
      const result = await aiService.generateMermaid('create a mindmap', 'en')

      expect(result).toBe('')
      expect(generateTextMock).not.toHaveBeenCalled()
    })

    it('throws an error if the tokens per day limit is reached', async () => {
      // Configure a small daily token limit
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: undefined,
        rpm: undefined,
        tpd: '1500', // Daily limit of 1500 tokens
      } as LLMProps)

      aiService = new AiService()

      // First request uses 500 tokens
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: { totalTokens: 500 },
      })
      await aiService.generateMermaid('first request', 'en')

      // Second request uses 600 tokens (total 1100)
      generateTextMock.mockResolvedValueOnce({
        text: 'second response',
        usage: { totalTokens: 600 },
      })
      await aiService.generateMermaid('second request', 'en')

      // Third request would exceed the limit (1100 + 1000 estimated > 1500)
      await expect(
        aiService.generateMermaid('third request', 'en')
      ).rejects.toThrow(RateLimitExceededException)
      await expect(
        aiService.generateMermaid('third request', 'en')
      ).rejects.toThrow('Token limit exceeded.')
    })

    it('throws an error if the tokens per minute limit is reached', async () => {
      // Configure a small per-minute token limit
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '1500', // Limit of 1500 tokens per minute (to account for estimated 1000)
        rpm: undefined,
        tpd: undefined,
      } as LLMProps)

      aiService = new AiService()

      // First request uses 600 tokens (600 tracked + 1000 estimated for next = 1600 > 1500)
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: { totalTokens: 600 },
      })
      await aiService.generateMermaid('first request', 'en')

      // Second request would exceed the limit (600 tracked + 1000 estimated > 1500)
      await expect(
        aiService.generateMermaid('second request', 'en')
      ).rejects.toThrow(RateLimitExceededException)
      await expect(
        aiService.generateMermaid('second request', 'en')
      ).rejects.toThrow('Token limit exceeded.')
    })

    it('throws an error if the requests per minute limit is reached', async () => {
      // Configure a small requests per minute limit
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: undefined,
        rpm: '3', // Limit of 3 requests per minute
        tpd: undefined,
      } as LLMProps)

      aiService = new AiService()

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        generateTextMock.mockResolvedValueOnce({
          text: `response ${i}`,
          usage: { totalTokens: 100 },
        })
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
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '1500',
        rpm: '3',
        tpd: undefined,
      } as LLMProps)

      aiService = new AiService()

      // Make one request that uses 600 tokens
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: { totalTokens: 600 },
      })
      await aiService.generateMermaid('first request', 'en')

      // Second request would exceed limit (600 + 1000 estimated > 1500)
      await expect(
        aiService.generateMermaid('second request', 'en')
      ).rejects.toThrow(RateLimitExceededException)

      // Advance time by more than 1 minute
      jest.advanceTimersByTime(61000)

      // Now the request should succeed since the minute has passed
      generateTextMock.mockResolvedValueOnce({
        text: 'second response',
        usage: { totalTokens: 400 },
      })
      const result = await aiService.generateMermaid(
        'second request after wait',
        'en'
      )
      expect(result).toBe('second response')
    })

    it('resets daily token count when date changes', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: undefined,
        rpm: undefined,
        tpd: '1500',
      } as LLMProps)

      aiService = new AiService()

      // Use up most of the daily limit
      generateTextMock.mockResolvedValueOnce({
        text: 'first response',
        usage: { totalTokens: 600 },
      })
      await aiService.generateMermaid('first request', 'en')

      // Second request would exceed daily limit (600 + 1000 estimated > 1500)
      await expect(
        aiService.generateMermaid('second request', 'en')
      ).rejects.toThrow(RateLimitExceededException)

      // Mock date change to next day
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const originalDate = global.Date
      const dateSpy = jest
        .spyOn(global, 'Date')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(((...args: any[]) => {
          if (args.length === 0) {
            return tomorrow
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (originalDate as any)(...args)
        }) as any)
      // Restore Date.now
      Date.now = originalDate.now

      // Now the request should succeed with reset daily counter
      generateTextMock.mockResolvedValueOnce({
        text: 'second response',
        usage: { totalTokens: 500 },
      })
      const result = await aiService.generateMermaid(
        'second request next day',
        'en'
      )
      expect(result).toBe('second response')

      // Restore Date mock
      dateSpy.mockRestore()
    })

    it('handles multiple rate limits simultaneously', async () => {
      getLLMConfigMock.mockReturnValue({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '5000', // 5000 tokens per minute (to allow 4 * 400 + 1000 estimated)
        rpm: '5', // 5 requests per minute
        tpd: '5000', // 5000 tokens per day
      } as LLMProps)

      aiService = new AiService()

      // Make 4 requests, each using 400 tokens (total 1600 tokens, 4 requests)
      for (let i = 0; i < 4; i++) {
        generateTextMock.mockResolvedValueOnce({
          text: `response ${i}`,
          usage: { totalTokens: 400 },
        })
        await aiService.generateMermaid(`request ${i}`, 'en')
      }

      // 5th request should succeed (still within all limits: 1600 + 300 = 1900 < 5000)
      generateTextMock.mockResolvedValueOnce({
        text: 'fifth response',
        usage: { totalTokens: 300 },
      })
      await aiService.generateMermaid('fifth request', 'en')

      // 6th request should fail due to RPM limit (6 > 5)
      await expect(
        aiService.generateMermaid('sixth request', 'en')
      ).rejects.toThrow('Request limit exceeded.')
    })
  })
})
