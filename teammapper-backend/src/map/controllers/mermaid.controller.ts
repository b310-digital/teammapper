import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseFilters,
} from '@nestjs/common'
import * as v from 'valibot'
import { AiService } from '../services/ai.service'
import { RateLimitExceptionFilter } from './rate-limit-exception.filter'
import { MermaidCreateSchema } from '../schemas/mermaid.schema'

@UseFilters(RateLimitExceptionFilter)
@Controller('api/mermaid')
export default class AiController {
  constructor(private aiService: AiService) {}

  @Post('/create')
  async createMermaid(@Body() body: unknown) {
    const result = v.safeParse(MermaidCreateSchema, body)
    if (!result.success) {
      throw new BadRequestException(result.issues)
    }
    return this.aiService.generateMermaid(
      result.output.mindmapDescription,
      result.output.language
    )
  }
}
