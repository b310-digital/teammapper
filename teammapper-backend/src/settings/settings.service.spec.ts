import { jest } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { SettingsService } from './settings.service'

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs')
  return {
    ...actual,
    readFileSync: jest.fn(actual.readFileSync),
    existsSync: jest.fn(actual.existsSync),
  }
})

describe('SettingsService', () => {
  beforeEach(() => {
    jest.mocked(fs.readFileSync).mockClear()
    jest.mocked(fs.existsSync).mockClear()
  })

  it('returns settings carrying the backend package version', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
    )

    const settings = new SettingsService().getSettings()

    expect(settings.systemSettings.info.version).toBe(packageJson.version)
  })

  // The server resolves the settings when serverSettings loads, so a
  // request must read no file.
  it('reads no file when it answers', () => {
    new SettingsService().getSettings()

    expect(fs.readFileSync).not.toHaveBeenCalled()
    expect(fs.existsSync).not.toHaveBeenCalled()
  })

  it('returns equal settings on two calls', () => {
    const service = new SettingsService()

    expect(service.getSettings()).toEqual(service.getSettings())
  })

  it('returns a distinct object on each call', () => {
    const service = new SettingsService()
    const first = service.getSettings()

    first.systemSettings.featureFlags.sharing =
      !first.systemSettings.featureFlags.sharing

    expect(service.getSettings().systemSettings.featureFlags.sharing).not.toBe(
      first.systemSettings.featureFlags.sharing
    )
  })
})
