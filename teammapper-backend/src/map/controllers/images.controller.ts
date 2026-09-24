import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { Response } from 'express'
import { validate as uuidValidate } from 'uuid'
import { ImageUploadResponse, isRasterImageMimeType } from '@teammapper/shared'
import { ImagesService } from '../services/images.service'
import {
  MapExistsGuard,
  MapRequest,
  MapWriteAccessGuard,
} from './map-access.guards'
import {
  RasterImageValidator,
  UploadedImageFile,
} from '../utils/rasterImageValidator'
import configService from '../../config.service'

/** A year, the longest max-age caches honour. */
const IMAGE_MAX_AGE_SECONDS = 31_536_000

/**
 * Uploads and serves node images. The guards run the rate limit, the map
 * lookup and the secret check before the interceptor reads the body.
 */
@Controller('api/maps/:id/images')
export default class ImagesController {
  constructor(private imagesService: ImagesService) {}

  @Post()
  @UseGuards(ThrottlerGuard, MapExistsGuard, MapWriteAccessGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: configService.getUploadImageMaxSizeBytes(),
        files: 1,
      },
    })
  )
  async upload(
    @Req() request: MapRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new RasterImageValidator()],
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      })
    )
    file: UploadedImageFile
  ): Promise<ImageUploadResponse> {
    const map = request.mmpMap
    if (!map) throw new NotFoundException()
    // RasterImageValidator checked both; the narrowing is for the compiler.
    if (!file.buffer || !isRasterImageMimeType(file.mimetype)) {
      throw new UnprocessableEntityException()
    }
    const reference = await this.imagesService.storeImage(map.id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    })
    return { reference }
  }

  /** Needs no secret, so view-only users see the images. */
  @Get(':imageId')
  async read(
    @Param('id') mapId: string,
    @Param('imageId') imageId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    if (!uuidValidate(mapId)) throw new NotFoundException()
    const image = await this.imagesService.readImage(mapId, imageId)
    if (!image) throw new NotFoundException()
    response.set({
      // Private, so shared proxies stop serving the images of a deleted map.
      'Cache-Control': `private, max-age=${IMAGE_MAX_AGE_SECONDS}, immutable`,
      'X-Content-Type-Options': 'nosniff',
    })
    return new StreamableFile(image.data, {
      type: image.mimetype,
      length: image.data.length,
      disposition: 'inline; filename="image"',
    })
  }
}
