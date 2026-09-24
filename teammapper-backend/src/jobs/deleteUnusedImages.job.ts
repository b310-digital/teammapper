import { NestFactory } from '@nestjs/core'
import { ImagesService } from '../map/services/images.service'
import { JobsModule } from './jobs.module'
import { Logger } from '@nestjs/common'

async function bootstrap() {
  const application = await NestFactory.createApplicationContext(JobsModule)

  const logger = new Logger('TaskRunner')
  const imagesService = application.get(ImagesService)

  logger.log('--- Deleting unused images ... ---')
  const result = await imagesService.deleteUnusedImages()
  logger.log('Deleted images: ' + result)
  logger.log('--- Finished deleting unused images ---')

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
