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
import { MermaidCreateSchema, sanitizeIssues } from '@teammapper/shared'

@UseFilters(RateLimitExceptionFilter)
@Controller('api/mermaid')
export default class AiController {
  constructor(private aiService: AiService) {}

  @Post('/create')
  async createMermaid(@Body() body: unknown) {
    const result = v.safeParse(MermaidCreateSchema, body)
    if (!result.success) {
      throw new BadRequestException(sanitizeIssues(result.issues))
    }
    const { mindmapDescription, language, levels, childrenPerNode } =
      result.output
    return this.aiService.generateMermaid(mindmapDescription, language, {
      levels,
      childrenPerNode,
    })
  }
}
