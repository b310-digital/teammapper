import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import type { IncomingMessage } from 'http'
import configService from '../../config.service'

interface Rejection {
  status: number
  reason: string
}

@Injectable()
export class WsConnectionLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(WsConnectionLimiterService.name)

  private globalConnectionCount = 0
  private readonly perIpConnectionCount = new Map<string, number>()
  private readonly perIpRateWindows = new Map<string, number[]>()

  onModuleDestroy(): void {
    this.reset()
  }

  checkLimits(req: IncomingMessage): Rejection | null {
    if (!configService.isYjsRateLimitingEnabled()) return null

    const globalRejection = this.checkGlobalLimit()
    if (globalRejection) return globalRejection

    const ip = this.getClientIp(req)
    const ipRejection = this.checkPerIpLimit(ip)
    if (ipRejection) return ipRejection

    const rateRejection = this.checkRateLimit(ip)
    if (rateRejection) return rateRejection

    this.acceptConnection(ip)
    return null
  }

  releaseConnection(ip: string): void {
    this.globalConnectionCount = Math.max(0, this.globalConnectionCount - 1)
    this.decrementIpCount(ip)
  }

  cleanupExpiredRateWindows(): void {
    if (!configService.isYjsRateLimitingEnabled()) return

    const windowMs = configService.getWsPerIpRateWindowMs()
    const now = Date.now()
    for (const [ip, timestamps] of this.perIpRateWindows) {
      const recent = timestamps.filter((t) => now - t < windowMs)
      if (recent.length === 0) {
        this.perIpRateWindows.delete(ip)
      } else {
        this.perIpRateWindows.set(ip, recent)
      }
    }
  }

  getClientIp(req: IncomingMessage): string {
    if (configService.isWsTrustProxy()) {
      const forwarded = req.headers['x-forwarded-for']
      if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
    }
    return req.socket?.remoteAddress ?? 'unknown'
  }

  reset(): void {
    this.globalConnectionCount = 0
    this.perIpConnectionCount.clear()
    this.perIpRateWindows.clear()
  }

  private checkGlobalLimit(): Rejection | null {
    const globalMax = configService.getWsGlobalMaxConnections()
    if (this.globalConnectionCount >= globalMax) {
      this.logger.warn(`Global connection limit reached (${globalMax})`)
      return { status: 503, reason: 'Service Unavailable' }
    }
    return null
  }

  private checkPerIpLimit(ip: string): Rejection | null {
    const perIpMax = configService.getWsPerIpMaxConnections()
    const currentIpCount = this.perIpConnectionCount.get(ip) ?? 0
    if (currentIpCount >= perIpMax) {
      this.logger.warn(
        `Per-IP connection limit reached for ${ip} (${perIpMax})`
      )
      return { status: 429, reason: 'Too Many Requests' }
    }
    return null
  }

  private checkRateLimit(ip: string): Rejection | null {
    if (this.isRateLimited(ip)) {
      this.logger.warn(`Rate limit exceeded for ${ip}`)
      return { status: 429, reason: 'Too Many Requests' }
    }
    return null
  }

  private acceptConnection(ip: string): void {
    this.recordConnectionAttempt(ip)
    this.globalConnectionCount++
    const currentIpCount = this.perIpConnectionCount.get(ip) ?? 0
    this.perIpConnectionCount.set(ip, currentIpCount + 1)
  }

  private isRateLimited(ip: string): boolean {
    const windowMs = configService.getWsPerIpRateWindowMs()
    const maxRate = configService.getWsPerIpRateLimit()
    const now = Date.now()
    const timestamps = this.perIpRateWindows.get(ip) ?? []
    const recent = timestamps.filter((t) => now - t < windowMs)
    return recent.length >= maxRate
  }

  private recordConnectionAttempt(ip: string): void {
    const existing = this.perIpRateWindows.get(ip) ?? []
    this.perIpRateWindows.set(ip, [...existing, Date.now()])
  }

  private decrementIpCount(ip: string): void {
    const count = this.perIpConnectionCount.get(ip) ?? 0
    if (count <= 1) {
      this.perIpConnectionCount.delete(ip)
    } else {
      this.perIpConnectionCount.set(ip, count - 1)
    }
  }
}
