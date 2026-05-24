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
})
