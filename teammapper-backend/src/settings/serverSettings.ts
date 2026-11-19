import { Settings } from '@teammapper/shared'
import { readServerVersion, resolveSystemSettings } from './resolveSettings'
import { readUserSettings } from './readUserSettings'

// The server resolves the settings once, at startup.
export const serverSettings: Settings = {
  systemSettings: resolveSystemSettings(process.env, readServerVersion()),
  userSettings: readUserSettings(),
}
