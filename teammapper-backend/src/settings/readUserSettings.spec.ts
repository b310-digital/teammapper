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

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'))
    fs.copyFileSync(DEFAULT_FILE, path.join(configDir, 'settings.default.json'))
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('reads the shipped default file without an override', () => {
    expect(readUserSettings()).toEqual(readDefaultFile().userSettings)
  })

  it('reads the override file instead of the default file', () => {
    const override = readDefaultFile()
    override.userSettings.mapOptions.branchStyle = 'curved'
    writeOverride(JSON.stringify(override))

    expect(readUserSettings(configDir).mapOptions.branchStyle).toBe('curved')
  })

  it('rejects an incomplete override instead of merging it', () => {
    writeOverride(
      JSON.stringify({
        userSettings: { general: readDefaultFile().userSettings.general },
      })
    )

    expect(() => readUserSettings(configDir)).toThrow('settings.override.json')
  })

  it('rejects an override with system settings', () => {
    writeOverride(
      JSON.stringify({ ...readDefaultFile(), systemSettings: { urls: {} } })
    )

    expect(() => readUserSettings(configDir)).toThrow('systemSettings')
  })

  it('names the file when the override is no valid JSON', () => {
    writeOverride('{ "userSettings": ')

    expect(() => readUserSettings(configDir)).toThrow(
      `Cannot read settings file ${path.join(configDir, 'settings.override.json')}`
    )
  })
})
