import {
  createOpenAICompatible,
  OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible'
import { OpenAIProvider, createOpenAI } from '@ai-sdk/openai'
import { LLMProps } from 'src/config.service'

const PROVIDER_STACKIT = 'stackit'

type SupportedProvider = OpenAIProvider | OpenAICompatibleProvider

const createStackitProvider = (
  llmConfig: LLMProps
): OpenAICompatibleProvider | undefined => {
  if (!llmConfig.url || !llmConfig.token) return

  return createOpenAICompatible({
    baseURL: llmConfig.url,
    name: 'stackit',
    headers: {
      Authorization: `Bearer ${llmConfig.token}`,
    },
  })
}

const createDefaultProvider = (
  llmConfig: LLMProps
): OpenAIProvider | undefined => {
  if (!llmConfig.token) return

  return createOpenAI({
    apiKey: llmConfig.token,
  })
}

export const createProvider = (
  llmConfig: LLMProps
): SupportedProvider | undefined =>
  llmConfig.provider === PROVIDER_STACKIT
    ? createStackitProvider(llmConfig)
    : createDefaultProvider(llmConfig)
