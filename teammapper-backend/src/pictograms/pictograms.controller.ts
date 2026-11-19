import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common'
import type { Response } from 'express'
import {
  Pictogram,
  sanitizeIssues,
  SUPPORTED_LANGUAGES,
} from '@teammapper/shared'
import * as v from 'valibot'
import { SettingsService } from '../settings/settings.service'
import { PictogramsService } from './pictograms.service'

const SearchParamsSchema = v.object({
  language: v.picklist([...SUPPORTED_LANGUAGES]),
  term: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(100),
    // encodeURIComponent keeps dots, so fetch would resolve `..` to a parent path.
    v.regex(/[^.]/)
  ),
})

const IMAGE_ID_PATTERN = /^\d{1,9}$/

/**
 * Serves ARASAAC pictogram searches and images. Each handler checks the
 * pictograms flag before it reads a parameter, so a disabled instance
 * answers 404 to every request.
 */
@Controller('arasaac')
export class PictogramsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly pictogramsService: PictogramsService
  ) {}

  @Get('api/pictograms/:language/search/:term')
  async search(
    @Param('language') language: string,
    @Param('term') term: string
  ): Promise<Pictogram[]> {
    this.assertEnabled()
    const params = v.safeParse(SearchParamsSchema, { language, term })
    if (!params.success) {
      throw new BadRequestException(sanitizeIssues(params.issues))
    }
    return this.pictogramsService.searchPictograms(
      params.output.language,
      params.output.term
    )
  }

  @Get('images/pictograms/:id/:file')
  async image(
    @Param('id') id: string,
    @Param('file') file: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    this.assertEnabled()
    this.assertImagePath(id, file)
    const image = await this.pictogramsService.fetchPictogramImage(Number(id))
    if (!image) throw new NotFoundException()
    response.set({
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    })
    return new StreamableFile(image, { type: 'image/png' })
  }

  private assertImagePath(id: string, file: string): void {
    if (IMAGE_ID_PATTERN.test(id) && file === `${id}_300.png`) return
    throw new NotFoundException()
  }

  private assertEnabled(): void {
    const { featureFlags } = this.settingsService.getSettings().systemSettings
    if (!featureFlags.pictograms) throw new NotFoundException()
  }
}
