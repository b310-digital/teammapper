import { Body, Controller, Post, UseFilters } from '@nestjs/common'
import { IMermaidCreateRequest } from '../types'
import { AiService } from '../services/ai.service'
import { RateLimitExceptionFilter } from './rate-limit-exception.filter'

@UseFilters(RateLimitExceptionFilter)
@Controller('api/mermaid')
export default class AiController {
  constructor(private aiService: AiService) {}

  @Post('/create')
  async createMermaid(@Body() body: IMermaidCreateRequest) {
    return this.aiService.generateMermaid(
      body.mindmapDescription,
      body.language
    )
  }
}
