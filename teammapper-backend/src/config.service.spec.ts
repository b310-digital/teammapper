describe('ConfigService', () => {
  function createConfigService(env: Record<string, string | undefined>) {
    // Re-import fresh each time to avoid singleton caching
    jest.resetModules()
    jest.replaceProperty(process, 'env', {
      // Required env vars to avoid ensureValues throwing
      POSTGRES_DATABASE: 'test',
      POSTGRES_HOST: 'localhost',
      POSTGRES_PASSWORD: 'pass',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'user',
      ...env,
    } as NodeJS.ProcessEnv)
    return require('./config.service').default // eslint-disable-line @typescript-eslint/no-require-imports
  }

  describe('getLogLevels', () => {
    it('returns error, warn, log, debug when LOG_LEVEL=debug', () => {
      const config = createConfigService({ LOG_LEVEL: 'debug' })
      expect(config.getLogLevels()).toEqual(['error', 'warn', 'log', 'debug'])
    })

    it('returns error, warn when LOG_LEVEL=warn', () => {
      const config = createConfigService({ LOG_LEVEL: 'warn' })
      expect(config.getLogLevels()).toEqual(['error', 'warn'])
    })

    it('returns error only when LOG_LEVEL=error', () => {
      const config = createConfigService({ LOG_LEVEL: 'error' })
      expect(config.getLogLevels()).toEqual(['error'])
    })

    it('returns all levels when LOG_LEVEL=verbose', () => {
      const config = createConfigService({ LOG_LEVEL: 'verbose' })
      expect(config.getLogLevels()).toEqual([
        'error',
        'warn',
        'log',
        'debug',
        'verbose',
      ])
    })

    it('returns error, warn, log when LOG_LEVEL=log', () => {
      const config = createConfigService({ LOG_LEVEL: 'log' })
      expect(config.getLogLevels()).toEqual(['error', 'warn', 'log'])
    })

    it('defaults to debug in DEV mode when LOG_LEVEL is not set', () => {
      const config = createConfigService({ MODE: 'DEV' })
      expect(config.getLogLevels()).toEqual(['error', 'warn', 'log', 'debug'])
    })

    it('defaults to log in production mode when LOG_LEVEL is not set', () => {
      const config = createConfigService({ MODE: 'PROD' })
      expect(config.getLogLevels()).toEqual(['error', 'warn', 'log'])
    })

    it('falls back to MODE-based default for invalid LOG_LEVEL', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      const config = createConfigService({ LOG_LEVEL: 'trace', MODE: 'DEV' })

      expect(config.getLogLevels()).toEqual(['error', 'warn', 'log', 'debug'])
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid LOG_LEVEL')
      )

      warnSpy.mockRestore()
    })

    it('handles case-insensitive LOG_LEVEL values', () => {
      const config = createConfigService({ LOG_LEVEL: 'DEBUG' })
      expect(config.getLogLevels()).toEqual(['error', 'warn', 'log', 'debug'])
    })
  })

  describe('getTrustProxy', () => {
    it.each([
      [undefined, false],
      ['false', false],
      ['0', false],
      ['-1', false],
      ['1.5', false],
      ['yes', false],
      ['true', true],
      ['TRUE', true],
      ['1', 1],
      [' 2 ', 2],
    ])('reads WS_TRUST_PROXY=%p as %p', (value, expected) => {
      const config = createConfigService({ WS_TRUST_PROXY: value })
      expect(config.getTrustProxy()).toBe(expected)
    })
  })

  describe('pictogram upstreams', () => {
    it('defaults to the public ARASAAC hosts', () => {
      const config = createConfigService({})
      expect(config.getPictogramApiUrl()).toBe('https://api.arasaac.org/api')
      expect(config.getPictogramImagesUrl()).toBe('https://static.arasaac.org/')
    })

    it('reads PICTOGRAM_API_URL and PICTOGRAM_IMAGES_URL', () => {
      const config = createConfigService({
        PICTOGRAM_API_URL: 'https://api.teammapper.localhost/api',
        PICTOGRAM_IMAGES_URL: 'https://static.teammapper.localhost/',
      })
      expect(config.getPictogramApiUrl()).toBe(
        'https://api.teammapper.localhost/api'
      )
      expect(config.getPictogramImagesUrl()).toBe(
        'https://static.teammapper.localhost/'
      )
    })
  })

  describe('legal urls', () => {
    it.each([undefined, '', '  '])('reads IMPRINT_URL=%p as null', (value) => {
      const config = createConfigService({ IMPRINT_URL: value })
      expect(config.getImprintUrl()).toBeNull()
    })

    it.each([undefined, '', '  '])('reads PRIVACY_URL=%p as null', (value) => {
      const config = createConfigService({ PRIVACY_URL: value })
      expect(config.getPrivacyUrl()).toBeNull()
    })

    it('reads IMPRINT_URL and PRIVACY_URL without surrounding blanks', () => {
      const config = createConfigService({
        IMPRINT_URL: ' https://teammapper.localhost/imprint ',
        PRIVACY_URL: 'https://teammapper.localhost/privacy',
      })
      expect(config.getImprintUrl()).toBe(
        'https://teammapper.localhost/imprint'
      )
      expect(config.getPrivacyUrl()).toBe(
        'https://teammapper.localhost/privacy'
      )
    })
  })
})
