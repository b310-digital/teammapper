import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import deepmerge from 'deepmerge'

@Injectable()
export class SettingsService {
  private readonly mode = process.env.MODE == 'DEV' ? 'dev' : 'prod'
  private readonly defaultSettingsPath = path.join(
    __dirname,
    '../..',
    `config/settings.${this.mode}.json`
  )

  private readonly overrideSettingsPath = path.join(
    __dirname,
    '../..',
    'config/settings.override.json'
  )

  getSettings() {
    const defaultFileData = fs.readFileSync(this.defaultSettingsPath, 'utf-8')
    const defaultSettings = JSON.parse(defaultFileData)

    let overrideSettings = {}

    if (
      fs.existsSync(this.overrideSettingsPath) &&
      fs.statSync(this.overrideSettingsPath).size > 0
    ) {
      const overrideFileData = fs.readFileSync(
        this.overrideSettingsPath,
        'utf-8'
      )
      overrideSettings = JSON.parse(overrideFileData)
    }

    return deepmerge(defaultSettings, overrideSettings)
  }
}
