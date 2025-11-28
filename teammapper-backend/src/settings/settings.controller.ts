import { Controller, Get } from '@nestjs/common'
import { SettingsService } from './settings.service'

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings()
  }
}
