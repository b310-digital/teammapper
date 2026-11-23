import * as fs from 'fs'
import * as path from 'path'
import { DEFAULT_SYSTEM_SETTINGS, SystemSettings } from '@teammapper/shared'

export type Env = Record<string, string | undefined>

const SERVER_PICTOGRAM_API_URL = '/arasaac/api/pictograms'
const SERVER_PICTOGRAM_STATIC_URL = '/arasaac/images/pictograms'

/**
 * Builds the system settings from DEFAULT_SYSTEM_SETTINGS and the
 * environment variables. The result shares no object with the defaults.
 */
export function resolveSystemSettings(
  env: Env,
  version: string
): SystemSettings {
  const settings = structuredClone(DEFAULT_SYSTEM_SETTINGS)
  settings.info.version = version
  applyFeatureFlags(settings, env)
  applyUrls(settings, env)
  return settings
}

/** Reads the version of the backend package.json, from src/ and from dist/. */
export function readServerVersion(): string {
  const packagePath = path.join(__dirname, '../../package.json')
  const packageJson: { version?: unknown } = JSON.parse(
    fs.readFileSync(packagePath, 'utf8')
  )
  if (typeof packageJson.version !== 'string' || !packageJson.version) {
    throw new Error(`settings error - no version in ${packagePath}`)
  }
  return packageJson.version
}

function applyFeatureFlags(settings: SystemSettings, env: Env): void {
  const flags = settings.featureFlags
  flags.ai = parseFlag(env.AI_ENABLED) ?? flags.ai
  flags.pictograms = parseFlag(env.FEATURE_PICTOGRAMS) ?? flags.pictograms
  flags.arrows = parseFlag(env.FEATURE_ARROWS) ?? flags.arrows
  flags.sharing = parseFlag(env.FEATURE_SHARING) ?? flags.sharing
  settings.info.aiModel = flags.ai ? blankToNull(env.AI_LLM_MODEL) : null
}

function applyUrls(settings: SystemSettings, env: Env): void {
  const urls = settings.urls
  urls.imprintUrl = blankToNull(env.IMPRINT_URL)
  urls.privacyUrl = blankToNull(env.PRIVACY_URL)
  if (parseFlag(env.PICTOGRAMS_VIA_SERVER) === true) {
    urls.pictogramApiUrl = SERVER_PICTOGRAM_API_URL
    urls.pictogramStaticUrl = SERVER_PICTOGRAM_STATIC_URL
  }
}

/** Reads `true` or `false` in upper or lower case; other values give undefined. */
export function parseFlag(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

/** Trims the value and reads a blank or missing one as null. */
function blankToNull(value: string | undefined): string | null {
  return value?.trim() || null
}
