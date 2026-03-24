import { createProvider } from './aiProvider'
import { LLMProps } from 'src/config.service'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'

jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(() => 'openai-compatible-provider'),
}))

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => 'openai-provider'),
}))

describe('createProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create default OpenAI provider when no provider specified', () => {
    const config: LLMProps = { token: 'test-token', provider: 'openai' }
    const result = createProvider(config)

    expect(result).toBe('openai-provider')
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'test-token' })
  })

  it('should return undefined for default provider when token is missing', () => {
    const config: LLMProps = { provider: 'openai' }
    const result = createProvider(config)

    expect(result).toBeUndefined()
  })

  it('should create openai-compatible provider with correct config', () => {
    const config: LLMProps = {
      provider: 'openai-compatible',
      url: 'https://api.example.com',
      token: 'test-token',
    }
    const result = createProvider(config)

    expect(result).toBe('openai-compatible-provider')
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      baseURL: 'https://api.example.com',
      name: 'openai-compatible',
      headers: { Authorization: 'Bearer test-token' },
    })
  })

  it('should pass provider value as the SDK name parameter', () => {
    const config: LLMProps = {
      provider: 'openai-compatible',
      url: 'https://api.example.com',
      token: 'test-token',
    }
    createProvider(config)

    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'openai-compatible' })
    )
  })

  it('should return undefined for openai-compatible provider when url is missing', () => {
    const config: LLMProps = {
      provider: 'openai-compatible',
      token: 'test-token',
    }
    const result = createProvider(config)

    expect(result).toBeUndefined()
  })

  it('should return undefined for openai-compatible provider when token is missing', () => {
    const config: LLMProps = {
      provider: 'openai-compatible',
      url: 'https://api.example.com',
    }
    const result = createProvider(config)

    expect(result).toBeUndefined()
  })

  it('should fall back to default OpenAI provider for unknown provider values', () => {
    const config: LLMProps = { provider: 'unknown', token: 'test-token' }
    const result = createProvider(config)

    expect(result).toBe('openai-provider')
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'test-token' })
  })
})
