import { Body, Controller, Post } from '@nestjs/common'
import { IMermaidCreateRequest } from '../types'
import { AiService } from '../services/ai.service'

@Controller('api/mermaid')
export default class AiController {
  constructor(private mermaidService: AiService) {}
  @Post('/create')
  async createMermaid(@Body() body: IMermaidCreateRequest) {
    return this.mermaidService.generateMermaid(
      body.mindmapDescription,
      body.language
    )
  }
}
