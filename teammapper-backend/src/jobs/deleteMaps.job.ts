import { NestFactory } from '@nestjs/core'
import { MapsService } from '../map/services/maps.service'
import AppModule from '../app.module'
import { Logger } from '@nestjs/common'
import configService from '../config.service'

async function bootstrap() {
  const application = await NestFactory.createApplicationContext(AppModule)

  const logger = new Logger('TaskRunner')
  const mapsService = application.get(MapsService)

  logger.log('--- Deleting old maps ... ---')
  const result = await mapsService.deleteOutdatedMaps(
    configService.deleteAfterDays()
  )
  logger.log('Deleted rows: ' + result)
  logger.log('--- Finished deleting maps ---')

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
