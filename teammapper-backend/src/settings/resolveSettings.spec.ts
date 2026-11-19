import * as fs from 'fs'
import * as path from 'path'
import { DEFAULT_SETTINGS } from '@teammapper/shared'
import { readServerVersion, resolveSettings } from './resolveSettings'

const VERSION = '1.2.3'

const flagsOf = (env: Record<string, string | undefined>) =>
  resolveSettings(env, VERSION).systemSettings.featureFlags

describe('resolveSettings', () => {
  describe('without environment variables', () => {
    it('returns the default settings with the given version', () => {
      const expected = structuredClone(DEFAULT_SETTINGS)
      expected.systemSettings.info.version = VERSION

      expect(resolveSettings({}, VERSION)).toEqual(expected)
    })

    it('does not share objects with DEFAULT_SETTINGS', () => {
      const result = resolveSettings({}, VERSION)

      result.systemSettings.featureFlags.sharing = false
      result.userSettings.general.language = 'xx'

      expect(DEFAULT_SETTINGS.systemSettings.featureFlags.sharing).toBe(true)
      expect(DEFAULT_SETTINGS.userSettings.general.language).toBe('en')
    })
  })

  describe('flag variables', () => {
    it('turns pictograms off when FEATURE_PICTOGRAMS is false', () => {
      expect(flagsOf({ FEATURE_PICTOGRAMS: 'false' }).pictograms).toBe(false)
    })

    it('turns sharing off when FEATURE_SHARING is false', () => {
      expect(flagsOf({ FEATURE_SHARING: 'false' }).sharing).toBe(false)
    })

    it('turns arrows on when FEATURE_ARROWS is true', () => {
      expect(flagsOf({ FEATURE_ARROWS: 'true' }).arrows).toBe(true)
    })

    it('turns ai on when AI_ENABLED is true', () => {
      expect(flagsOf({ AI_ENABLED: 'true' }).ai).toBe(true)
    })

    it('turns ai off when AI_ENABLED is false', () => {
      expect(flagsOf({ AI_ENABLED: 'false' }).ai).toBe(false)
    })

    it('turns sharing on when FEATURE_SHARING is true', () => {
      expect(flagsOf({ FEATURE_SHARING: 'true' }).sharing).toBe(true)
    })

    it('turns pictograms on when FEATURE_PICTOGRAMS is true', () => {
      expect(flagsOf({ FEATURE_PICTOGRAMS: 'true' }).pictograms).toBe(true)
    })

    it('turns arrows off when FEATURE_ARROWS is false', () => {
      expect(flagsOf({ FEATURE_ARROWS: 'false' }).arrows).toBe(false)
    })

    it('reads the value in upper case', () => {
      expect(flagsOf({ FEATURE_ARROWS: 'TRUE' }).arrows).toBe(true)
    })

    it('reads the value with surrounding spaces', () => {
      expect(flagsOf({ FEATURE_SHARING: ' false ' }).sharing).toBe(false)
    })

    it('keeps the default for an unknown value', () => {
      expect(flagsOf({ FEATURE_SHARING: 'yes' }).sharing).toBe(true)
    })

    it('keeps the default for a blank value', () => {
      expect(flagsOf({ FEATURE_PICTOGRAMS: '' }).pictograms).toBe(true)
    })
  })

  describe('ai model', () => {
    it('takes AI_LLM_MODEL when ai is on', () => {
      const settings = resolveSettings(
        { AI_ENABLED: 'true', AI_LLM_MODEL: 'model-test' },
        VERSION
      )

      expect(settings.systemSettings.info.aiModel).toBe('model-test')
    })

    it('is null when ai is off', () => {
      const settings = resolveSettings(
        { AI_ENABLED: 'false', AI_LLM_MODEL: 'model-test' },
        VERSION
      )

      expect(settings.systemSettings.info.aiModel).toBeNull()
    })

    it('is null when ai is on and AI_LLM_MODEL is unset', () => {
      const settings = resolveSettings({ AI_ENABLED: 'true' }, VERSION)

      expect(settings.systemSettings.info.aiModel).toBeNull()
    })
  })

  describe('legal urls', () => {
    const urlsOf = (env: Record<string, string | undefined>) =>
      resolveSettings(env, VERSION).systemSettings.urls

    it('trims IMPRINT_URL', () => {
      const urls = urlsOf({
        IMPRINT_URL: ' https://teammapper.localhost/imprint ',
      })

      expect(urls.imprintUrl).toBe('https://teammapper.localhost/imprint')
    })

    it('trims PRIVACY_URL', () => {
      const urls = urlsOf({
        PRIVACY_URL: ' https://teammapper.localhost/privacy ',
      })

      expect(urls.privacyUrl).toBe('https://teammapper.localhost/privacy')
    })

    it('reads a blank IMPRINT_URL as null', () => {
      expect(urlsOf({ IMPRINT_URL: '   ' }).imprintUrl).toBeNull()
    })

    it('reads a blank PRIVACY_URL as null', () => {
      expect(urlsOf({ PRIVACY_URL: '' }).privacyUrl).toBeNull()
    })

    it('leaves both urls null when the variables are unset', () => {
      const urls = urlsOf({})

      expect(urls.imprintUrl).toBeNull()
      expect(urls.privacyUrl).toBeNull()
    })
  })

  describe('pictogram urls', () => {
    const urlsOf = (env: Record<string, string | undefined>) =>
      resolveSettings(env, VERSION).systemSettings.urls

    it('switches both urls to the server routes when PICTOGRAMS_VIA_SERVER is true', () => {
      const urls = urlsOf({ PICTOGRAMS_VIA_SERVER: 'true' })

      expect(urls.pictogramApiUrl).toBe('/arasaac/api/pictograms')
      expect(urls.pictogramStaticUrl).toBe('/arasaac/images/pictograms')
    })

    it('reads PICTOGRAMS_VIA_SERVER in upper case with surrounding spaces', () => {
      const urls = urlsOf({ PICTOGRAMS_VIA_SERVER: ' TRUE ' })

      expect(urls.pictogramApiUrl).toBe('/arasaac/api/pictograms')
    })

    it('keeps the ARASAAC urls when PICTOGRAMS_VIA_SERVER is false', () => {
      const urls = urlsOf({ PICTOGRAMS_VIA_SERVER: 'false' })

      expect(urls.pictogramApiUrl).toBe('https://api.arasaac.org/v1/pictograms')
      expect(urls.pictogramStaticUrl).toBe(
        'https://static.arasaac.org/pictograms'
      )
    })

    it('keeps the ARASAAC urls when PICTOGRAMS_VIA_SERVER is unset', () => {
      const urls = urlsOf({})

      expect(urls.pictogramApiUrl).toBe('https://api.arasaac.org/v1/pictograms')
      expect(urls.pictogramStaticUrl).toBe(
        'https://static.arasaac.org/pictograms'
      )
    })
  })
})

describe('readServerVersion', () => {
  it('returns the version of the backend package.json', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
    )

    expect(readServerVersion()).toBe(packageJson.version)
  })
})
