import { WsConnectionLimiterService } from './ws-connection-limiter.service'
import { jest } from '@jest/globals'
import type { IncomingMessage } from 'http'

jest.mock('../../config.service', () => ({
  __esModule: true,
  default: {
    isYjsRateLimitingEnabled: jest.fn(() => true),
    isWsTrustProxy: jest.fn(() => false),
    getWsGlobalMaxConnections: jest.fn(() => 500),
    getWsPerIpMaxConnections: jest.fn(() => 50),
    getWsPerIpRateLimit: jest.fn(() => 10),
    getWsPerIpRateWindowMs: jest.fn(() => 10000),
  },
}))

import configService from '../../config.service'
const mockedConfig = configService as jest.Mocked<typeof configService>

const createMockRequest = (ip: string = '127.0.0.1'): IncomingMessage =>
  ({
    socket: { remoteAddress: ip },
    headers: {},
  }) as unknown as IncomingMessage

const createForwardedRequest = (
  forwardedIp: string,
  remoteIp: string = '10.0.0.1'
): IncomingMessage =>
  ({
    socket: { remoteAddress: remoteIp },
    headers: { 'x-forwarded-for': forwardedIp },
  }) as unknown as IncomingMessage

// Access private state for test setup
interface LimiterState {
  globalConnectionCount: number
  perIpConnectionCount: Map<string, number>
  perIpRateWindows: Map<string, number[]>
}

const getState = (service: WsConnectionLimiterService): LimiterState =>
  service as unknown as LimiterState

describe('WsConnectionLimiterService', () => {
  let service: WsConnectionLimiterService

  beforeEach(() => {
    service = new WsConnectionLimiterService()
  })

  afterEach(() => {
    service.reset()
    mockedConfig.isYjsRateLimitingEnabled.mockReturnValue(true)
    mockedConfig.isWsTrustProxy.mockReturnValue(false)
  })

  describe('checkLimits', () => {
    it('rejects at global limit with 503', () => {
      getState(service).globalConnectionCount = 500

      const result = service.checkLimits(createMockRequest('10.0.0.1'))

      expect(result).toEqual({ status: 503, reason: 'Service Unavailable' })
    })

    it('rejects at per-IP limit with 429', () => {
      getState(service).perIpConnectionCount.set('10.0.0.1', 50)

      const result = service.checkLimits(createMockRequest('10.0.0.1'))

      expect(result).toEqual({ status: 429, reason: 'Too Many Requests' })
    })

    it('rejects when rate limited with 429', () => {
      const now = Date.now()
      const timestamps = Array.from({ length: 10 }, (_, i) => now - i * 100)
      getState(service).perIpRateWindows.set('10.0.0.1', timestamps)

      const result = service.checkLimits(createMockRequest('10.0.0.1'))

      expect(result).toEqual({ status: 429, reason: 'Too Many Requests' })
    })

    it('accepts connection within all limits', () => {
      const result = service.checkLimits(createMockRequest('10.0.0.1'))

      expect(result).toBeNull()
    })

    it('increments global count on accept', () => {
      service.checkLimits(createMockRequest('10.0.0.1'))

      expect(getState(service).globalConnectionCount).toBe(1)
    })

    it('increments per-IP count on accept', () => {
      service.checkLimits(createMockRequest('10.0.0.1'))

      expect(getState(service).perIpConnectionCount.get('10.0.0.1')).toBe(1)
    })

    it('skips all checks when feature flag is disabled', () => {
      mockedConfig.isYjsRateLimitingEnabled.mockReturnValue(false)
      getState(service).globalConnectionCount = 500

      expect(service.checkLimits(createMockRequest('10.0.0.1'))).toBeNull()
    })
  })

  describe('releaseConnection', () => {
    it('decrements global count', () => {
      service.checkLimits(createMockRequest('10.0.0.1'))
      service.releaseConnection('10.0.0.1')

      expect(getState(service).globalConnectionCount).toBe(0)
    })

    it('decrements per-IP count', () => {
      service.checkLimits(createMockRequest('10.0.0.1'))
      service.checkLimits(createMockRequest('10.0.0.1'))
      service.releaseConnection('10.0.0.1')

      expect(getState(service).perIpConnectionCount.get('10.0.0.1')).toBe(1)
    })

    it('removes IP entry when count reaches zero', () => {
      service.checkLimits(createMockRequest('10.0.0.1'))
      service.releaseConnection('10.0.0.1')

      expect(getState(service).perIpConnectionCount.has('10.0.0.1')).toBe(false)
    })

    it('does not go below zero for global count', () => {
      service.releaseConnection('10.0.0.1')

      expect(getState(service).globalConnectionCount).toBe(0)
    })
  })

  describe('cleanupExpiredRateWindows', () => {
    it('removes expired rate windows', () => {
      const expired = Date.now() - 20000
      getState(service).perIpRateWindows.set('10.0.0.1', [expired])

      service.cleanupExpiredRateWindows()

      expect(getState(service).perIpRateWindows.has('10.0.0.1')).toBe(false)
    })

    it('keeps recent rate windows', () => {
      const recent = Date.now() - 100
      getState(service).perIpRateWindows.set('10.0.0.1', [recent])

      service.cleanupExpiredRateWindows()

      expect(getState(service).perIpRateWindows.has('10.0.0.1')).toBe(true)
    })

    it('skips cleanup when feature flag is disabled', () => {
      mockedConfig.isYjsRateLimitingEnabled.mockReturnValue(false)
      const expired = Date.now() - 20000
      getState(service).perIpRateWindows.set('10.0.0.1', [expired])

      service.cleanupExpiredRateWindows()

      expect(getState(service).perIpRateWindows.has('10.0.0.1')).toBe(true)
    })
  })

  describe('getClientIp', () => {
    it('uses remoteAddress by default', () => {
      const req = createMockRequest('192.168.1.1')

      expect(service.getClientIp(req)).toBe('192.168.1.1')
    })

    it('ignores x-forwarded-for when trust proxy is disabled', () => {
      const req = createForwardedRequest('203.0.113.50', '192.168.1.1')

      expect(service.getClientIp(req)).toBe('192.168.1.1')
    })

    it('uses x-forwarded-for when trust proxy is enabled', () => {
      mockedConfig.isWsTrustProxy.mockReturnValue(true)
      const req = createForwardedRequest('203.0.113.50, 70.41.3.18')

      expect(service.getClientIp(req)).toBe('203.0.113.50')
    })

    it('falls back to remoteAddress when trust proxy enabled but no header', () => {
      mockedConfig.isWsTrustProxy.mockReturnValue(true)
      const req = createMockRequest('192.168.1.1')

      expect(service.getClientIp(req)).toBe('192.168.1.1')
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      service.checkLimits(createMockRequest('10.0.0.1'))
      service.reset()

      expect(getState(service).globalConnectionCount).toBe(0)
      expect(getState(service).perIpConnectionCount.size).toBe(0)
    })
  })
})
