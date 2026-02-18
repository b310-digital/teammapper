import { jest } from '@jest/globals'
import { SettingsService } from './settings.service'
import configService from '../config.service'

jest.mock('../config.service')

describe('SettingsService', () => {
  let service: SettingsService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new SettingsService()
  })

  describe('getSettings', () => {
    it('should override ai feature flag with AI_ENABLED env value', () => {
      ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(false)
      ;(configService.isAiEnabled as jest.Mock).mockReturnValue(true)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags.ai).toBe(true)
    })

    it('should disable ai feature flag when AI_ENABLED is false', () => {
      ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(false)
      ;(configService.isAiEnabled as jest.Mock).mockReturnValue(false)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags.ai).toBe(false)
    })

    it('should override yjs feature flag with YJS_ENABLED env value', () => {
      ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(true)
      ;(configService.isAiEnabled as jest.Mock).mockReturnValue(false)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags.yjs).toBe(true)
    })

    it('should override both feature flags independently', () => {
      ;(configService.isYjsEnabled as jest.Mock).mockReturnValue(true)
      ;(configService.isAiEnabled as jest.Mock).mockReturnValue(true)

      const settings = service.getSettings()

      expect(settings.systemSettings.featureFlags).toEqual(
        expect.objectContaining({
          yjs: true,
          ai: true,
        })
      )
    })
  })
})
