import * as fs from 'fs'
import * as path from 'path'
import { parseSettingsFile, UserSettings } from '@teammapper/shared'
import { Env, parseFlag } from './resolveSettings'

const CONFIG_DIR = path.join(__dirname, '../../config')
const DEFAULT_FILE = 'settings.default.json'
const OVERRIDE_FILE = 'settings.override.json'

/**
 * Reads the user settings from settings.override.json when the operator
 * provides one, and from settings.default.json otherwise. The override
 * replaces the default file completely. Setting IGNORE_SETTINGS_OVERRIDE=true
 * skips the override. Throws on invalid JSON or an invalid field, so the
 * server refuses to start.
 */
export function readUserSettings(
  env: Env,
  configDir: string = CONFIG_DIR
): UserSettings {
  const file = settingsFilePath(env, configDir)
  return parseSettingsFile(readJson(file), file)
}

function settingsFilePath(env: Env, configDir: string): string {
  const defaultFile = path.join(configDir, DEFAULT_FILE)
  if (parseFlag(env.IGNORE_SETTINGS_OVERRIDE) === true) return defaultFile
  const override = path.join(configDir, OVERRIDE_FILE)
  return fs.existsSync(override) ? override : defaultFile
}

/** `cause` holds the error that reading or parsing the file threw. */
export class SettingsFileReadError extends Error {
  constructor(
    readonly file: string,
    readonly cause: unknown
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`Cannot read settings file ${file}: ${reason}`)
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new SettingsFileReadError(file, error)
  }
}
