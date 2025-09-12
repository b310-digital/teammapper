import { Injectable, Logger } from '@nestjs/common'
import { generateText } from 'ai'
import { systemPrompt } from '../utils/prompts'
import { createProvider } from '../utils/aiProvider'

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor() {}

  async generateMermaid(
    mindmapDescription: string,
    language: string
  ): Promise<string> {
    const provider = createProvider()
    if (!provider || !process.env.AI_LLM_MODEL) return ''

    const { text } = await generateText({
      model: provider(process.env.AI_LLM_MODEL),
      system: systemPrompt(language),
      prompt: mindmapDescription,
    })

    return text
  }
}
