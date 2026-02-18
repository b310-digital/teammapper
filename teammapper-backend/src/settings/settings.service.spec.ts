import { jest } from '@jest/globals'
import * as fs from 'fs'
import configService from '../config.service'
import { SettingsService } from './settings.service'
import { Settings } from './settings.types'

jest.mock('fs')
jest.mock('../config.service')

const mockedFs = fs as jest.Mocked<typeof fs>

const defaultSettings: Settings = {
  systemSettings: {
    info: { name: 'TeamMapper', version: '1.0.0' },
    urls: {
      pictogramApiUrl: 'https://api.example.com',
      pictogramStaticUrl: 'https://static.example.com',
    },
    featureFlags: { pictograms: true, ai: false, yjs: false },
  },
  userSettings: {
    general: { language: 'en' },
    mapOptions: {
      centerOnResize: false,
      autoBranchColors: true,
      showLinktext: false,
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
      defaultNode: {
        name: '',
        link: { href: '' },
        image: { src: '', size: 60 },
        colors: { name: '#666666', background: '#f5f5f5', branch: '#546e7a' },
        font: { size: 22, style: 'normal', weight: 'normal' },
        locked: true,
      },
      rootNode: {
        name: 'Root node',
        link: { href: '' },
        image: { src: '', size: 70 },
        colors: { name: '#666666', background: '#f5f5f5' },
        font: { size: 26, style: 'normal', weight: 'normal' },
      },
    },
  },
}

describe('SettingsService', () => {
  let service: SettingsService

  beforeEach(() => {
    jest.clearAllMocks()
    ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(false)
    ;(configService.isAiEnabled as jest.Mock).mockReturnValue(false)
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(defaultSettings))
    mockedFs.existsSync.mockReturnValue(false)

    service = new SettingsService()
  })

  describe('loading default settings', () => {
    it('should return settings parsed from the default config file', () => {
      const settings = service.getSettings()

      expect(settings.systemSettings.info).toEqual({
        name: 'TeamMapper',
        version: '1.0.0',
      })
    })

    it('should include user settings from the default config file', () => {
      const settings = service.getSettings()

      expect(settings.userSettings.general.language).toBe('en')
    })
  })

  describe('override settings', () => {
    it('should deep merge override file into default settings', () => {
      const overrideSettings = {
        systemSettings: {
          info: { version: '2.0.0' },
        },
      }
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.statSync.mockReturnValue({ size: 100 } as fs.Stats)
      mockedFs.readFileSync
        .mockReturnValueOnce(JSON.stringify(defaultSettings))
        .mockReturnValueOnce(JSON.stringify(overrideSettings))

      const settings = service.getSettings()

      expect(settings.systemSettings.info).toEqual({
        name: 'TeamMapper',
        version: '2.0.0',
      })
    })

    it('should skip override file when it does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false)

      const settings = service.getSettings()

      expect(settings.systemSettings.info.version).toBe('1.0.0')
    })

    it('should skip override file when it is empty', () => {
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.statSync.mockReturnValue({ size: 0 } as fs.Stats)

      const settings = service.getSettings()

      expect(settings.systemSettings.info.version).toBe('1.0.0')
    })
  })

  describe('feature flags', () => {
    it('should set ai flag to true when AI_ENABLED is true', () => {
      ;(configService.isAiEnabled as jest.Mock).mockReturnValue(true)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags.ai).toBe(true)
    })

    it('should set ai flag to false when AI_ENABLED is false', () => {
      ;(configService.isAiEnabled as jest.Mock).mockReturnValue(false)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags.ai).toBe(false)
    })

    it('should set yjs flag to true when YJS_ENABLED is true', () => {
      ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(true)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags.yjs).toBe(true)
    })

    it('should set yjs flag to false when YJS_ENABLED is false', () => {
      ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(false)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags.yjs).toBe(false)
    })

    it('should override file-based feature flags with config service values', () => {
      const settingsWithFlags = {
        ...defaultSettings,
        systemSettings: {
          ...defaultSettings.systemSettings,
          featureFlags: { pictograms: true, ai: true, yjs: true },
        },
      }
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(settingsWithFlags))
      ;(configService.isAiEnabled as jest.Mock).mockReturnValue(false)
      ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(false)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags).toEqual({
        pictograms: true,
        ai: false,
        yjs: false,
      })
    })
  })
})
