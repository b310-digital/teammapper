import { Settings } from '@teammapper/shared'
import { readServerVersion, resolveSettings } from './resolveSettings'

// The server resolves the settings once, at startup.
export const serverSettings: Settings = resolveSettings(
  process.env,
  readServerVersion()
)
