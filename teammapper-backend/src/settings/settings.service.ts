import { Injectable } from '@nestjs/common'
import { Settings } from '@teammapper/shared'
import { serverSettings } from './serverSettings'

@Injectable()
export class SettingsService {
  /** Returns a copy of the settings the server resolved at startup. */
  getSettings(): Settings {
    return structuredClone(serverSettings)
  }
}
