import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { readUserSettings } from './readUserSettings'

const DEFAULT_FILE = path.join(__dirname, '../../config/settings.default.json')

const readDefaultFile = () => JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'))

describe('readUserSettings', () => {
  let configDir: string

  const writeOverride = (content: string) =>
    fs.writeFileSync(path.join(configDir, 'settings.override.json'), content)

  const writeCurvedOverride = () => {
    const override = readDefaultFile()
    override.userSettings.mapOptions.branchStyle = 'curved'
    writeOverride(JSON.stringify(override))
  }

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'))
    fs.copyFileSync(DEFAULT_FILE, path.join(configDir, 'settings.default.json'))
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('reads the default file without an override', () => {
    expect(readUserSettings({}, configDir)).toEqual(
      readDefaultFile().userSettings
    )
  })

  it('reads the shipped default file when the override is ignored', () => {
    expect(readUserSettings({ IGNORE_SETTINGS_OVERRIDE: 'true' })).toEqual(
      readDefaultFile().userSettings
    )
  })

  it('reads the override file instead of the default file', () => {
    writeCurvedOverride()

    expect(readUserSettings({}, configDir).mapOptions.branchStyle).toBe(
      'curved'
    )
  })

  it('rejects an incomplete override instead of merging it', () => {
    writeOverride(
      JSON.stringify({
        userSettings: { general: readDefaultFile().userSettings.general },
      })
    )

    expect(() => readUserSettings({}, configDir)).toThrow(
      'settings.override.json'
    )
  })

  it('rejects an override with system settings', () => {
    writeOverride(
      JSON.stringify({ ...readDefaultFile(), systemSettings: { urls: {} } })
    )

    expect(() => readUserSettings({}, configDir)).toThrow('systemSettings')
  })

  it('names the file when the override is no valid JSON', () => {
    writeOverride('{ "userSettings": ')

    expect(() => readUserSettings({}, configDir)).toThrow(
      `Cannot read settings file ${path.join(configDir, 'settings.override.json')}`
    )
  })

  describe.each(['true', 'TRUE', ' true '])(
    'when IGNORE_SETTINGS_OVERRIDE is %j',
    (value: string) => {
      const env = { IGNORE_SETTINGS_OVERRIDE: value }

      it('returns the default settings although a valid override exists', () => {
        writeCurvedOverride()

        expect(readUserSettings(env, configDir)).toEqual(
          readDefaultFile().userSettings
        )
      })

      it('returns the default settings without reading an override with invalid JSON', () => {
        writeOverride('{ "userSettings": ')

        expect(readUserSettings(env, configDir)).toEqual(
          readDefaultFile().userSettings
        )
      })
    }
  )

  it.each([
    ['false', { IGNORE_SETTINGS_OVERRIDE: 'false' }],
    ['unset', {}],
    ['an empty string', { IGNORE_SETTINGS_OVERRIDE: '' }],
    ['yes', { IGNORE_SETTINGS_OVERRIDE: 'yes' }],
  ])(
    'reads the override file when IGNORE_SETTINGS_OVERRIDE is %s',
    (_label: string, env: Record<string, string | undefined>) => {
      writeCurvedOverride()

      expect(readUserSettings(env, configDir).mapOptions.branchStyle).toBe(
        'curved'
      )
    }
  )
})
