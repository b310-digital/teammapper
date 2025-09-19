import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

export interface AppSettings {
  apiUrl: string
  logLevel: string
}

@Injectable()
export class SettingsService {
  private readonly settingsPath = path.join(
    __dirname,
    '../..',
    'config/default-settings.json'
  )

  getSettings(): AppSettings {
    const fileData = fs.readFileSync(this.settingsPath, 'utf-8')
    const settings: AppSettings = JSON.parse(fileData)

    return settings
  }
}
