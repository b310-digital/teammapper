import { NestFactory } from '@nestjs/core'
import { ImageExtractionService } from '../map/services/image-extraction.service'
import { JobsModule } from './jobs.module'
import { Logger } from '@nestjs/common'

async function bootstrap() {
  const application = await NestFactory.createApplicationContext(JobsModule)

  const logger = new Logger('TaskRunner')
  const imageExtractionService = application.get(ImageExtractionService)

  logger.log('--- Extracting inline images to the image tables ... ---')
  const result = await imageExtractionService.extractAllMaps((total) =>
    logger.log(
      `Maps changed: ${total.maps}, images stored: ${total.images}, nodes changed: ${total.nodes}, nodes failed: ${total.failedNodes}, maps failed: ${total.failedMaps}`
    )
  )
  logger.log(
    `Extracted ${result.images} images of ${result.nodes} nodes in ${result.maps} maps`
  )
  if (result.failedNodes > 0 || result.failedMaps > 0) {
    logger.warn(
      `${result.failedNodes} nodes and ${result.failedMaps} maps failed; the warnings and errors above name each one`
    )
  }
  logger.log('--- Finished extracting images ---')

  await application.close()
  process.exit(0)
}

bootstrap().catch((error) => {
  const logger = new Logger('TaskRunner')
  logger.error(
    `Job failed: ${error instanceof Error ? error.message : String(error)}`
  )
  process.exit(1)
})
