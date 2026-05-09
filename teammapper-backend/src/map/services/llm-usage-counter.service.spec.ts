import { jest } from '@jest/globals'
import { Repository } from 'typeorm'
import { LlmUsageCounterService } from './llm-usage-counter.service'
import { LlmUsageCounter } from '../entities/llmUsageCounter.entity'

describe('LlmUsageCounterService', () => {
  let service: LlmUsageCounterService
  let queryMock: jest.Mock<(sql: string, params: unknown[]) => Promise<unknown>>

  beforeEach(() => {
    queryMock = jest.fn() as unknown as typeof queryMock
    const repo = { query: queryMock } as unknown as Repository<LlmUsageCounter>
    service = new LlmUsageCounterService(repo)
  })

  it('produces UTC date keys independent of locale', () => {
    const dateUsage = LlmUsageCounterService.currentDateUsage(
      new Date('2026-05-08T23:30:00Z')
    )
    expect(dateUsage).toBe('2026-05-08')
  })

  it('reserve issues an atomic upsert and returns numeric totals', async () => {
    queryMock.mockResolvedValueOnce([{ tokensUsed: '500', requestsCount: '3' }])
    const totals = await service.reserve('2026-05-08', 200)
    expect(totals).toEqual({ tokensUsed: 500, requestsCount: 3 })
  })

  it('reserve returns null when the SQL guard blocks the upsert', async () => {
    queryMock.mockResolvedValueOnce([])
    const totals = await service.reserve('2026-05-08', 200, 100)
    expect(totals).toBeNull()
  })

  it('reserve passes the dateUsage, tokens, and cap as bound parameters', async () => {
    queryMock.mockResolvedValueOnce([{ tokensUsed: '1', requestsCount: '1' }])
    await service.reserve('2026-05-08', 200, 1000)
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      '2026-05-08',
      200,
      1000,
    ])
  })

  it('reserve passes null when no cap is provided', async () => {
    queryMock.mockResolvedValueOnce([{ tokensUsed: '1', requestsCount: '1' }])
    await service.reserve('2026-05-08', 200)
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      '2026-05-08',
      200,
      null,
    ])
  })

  it('adjustTokens skips the database when delta is zero', async () => {
    await service.adjustTokens('2026-05-08', 0)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('adjustTokens issues an UPDATE for non-zero deltas', async () => {
    queryMock.mockResolvedValueOnce([])
    await service.adjustTokens('2026-05-08', -50)
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), [
      '2026-05-08',
      -50,
    ])
  })

  it('release decrements both tokens and request count', async () => {
    queryMock.mockResolvedValueOnce([])
    await service.release('2026-05-08', 200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('"requestsCount" - 1'),
      ['2026-05-08', 200]
    )
  })
})
