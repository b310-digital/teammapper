import { Body, Controller, Logger, Post } from '@nestjs/common'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from "ai";
import { mermaidMindmapSchema, systemPrompt } from '../utils/prompts';
import { IMermaidCreateRequest } from '../types';

const DEFAULT_LLM_MODEL = "neuralmagic/Mistral-Nemo-Instruct-2407-FP8"

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
      messages: [
        { role: 'system', content: systemPrompt('english') },
        { role: 'user', content: 'Something about houses' },
      ],
    })

    return text
  }
}