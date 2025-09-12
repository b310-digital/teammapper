import {
  createOpenAICompatible,
  OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible'
import { OpenAIProvider, createOpenAI } from '@ai-sdk/openai'

const PROVIDER_STACKIT = 'stackit'

type SupportedProvider = OpenAIProvider | OpenAICompatibleProvider

const createStackitProvider = (): OpenAICompatibleProvider =>
  createOpenAICompatible({
    baseURL: process.env.AI_LLM_URL as string,
    name: 'stackit',
    headers: {
      Authorization: `Bearer ${process.env.AI_LLM_TOKEN}`,
    },
  })

const createDefaultProvider = (): OpenAIProvider =>
  createOpenAI({
    baseURL: process.env.AI_LLM_URL as string,
    apiKey: process.env.AI_LLM_TOKEN,
  })

export const createProvider = (): SupportedProvider | undefined =>
  process.env.AI_LLM_URL && process.env.AI_LLM_TOKEN
    ? process.env.AI_LLM_PROVIDER === PROVIDER_STACKIT
      ? createStackitProvider()
      : createDefaultProvider()
    : undefined
