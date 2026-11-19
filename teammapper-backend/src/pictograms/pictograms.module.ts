import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module'
import { PictogramsController } from './pictograms.controller'
import {
  PICTOGRAM_FETCH_TIMEOUT_MS,
  PictogramsService,
} from './pictograms.service'

@Module({
  imports: [SettingsModule],
  controllers: [PictogramsController],
  providers: [
    PictogramsService,
    { provide: PICTOGRAM_FETCH_TIMEOUT_MS, useValue: 10_000 },
  ],
})
export class PictogramsModule {}
