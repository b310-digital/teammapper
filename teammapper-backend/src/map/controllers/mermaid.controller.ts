import { Body, Controller, Logger, Post } from '@nestjs/common'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from "ai"
import { systemPrompt } from '../utils/prompts'
import { IMermaidCreateRequest } from '../types'

//const DEFAULT_LLM_MODEL = "neuralmagic/Mistral-Nemo-Instruct-2407-FP8"
const DEFAULT_LLM_MODEL = 'cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic'

@Controller('api/mermaid')
export default class AiController {
  private readonly logger = new Logger(AiController.name)
  constructor() {}

  @Post('/create')
  async createMermaid(@Body() body: IMermaidCreateRequest) {
    const stackit = createOpenAICompatible({
      baseURL: process.env.AI_LLM_URL as string,
      name: 'stackit',
      headers: {
        Authorization: `Bearer ${process.env.AI_LLM_TOKEN}`,
      },
    })

    const { text, usage } = await generateText({
      model: stackit(DEFAULT_LLM_MODEL),
      system: systemPrompt('german'),
      prompt: 'Schwimmbäder',
    })

    console.log(text)

    return text
  }
}
