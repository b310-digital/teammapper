import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LlmUsageCounter } from '../entities/llmUsageCounter.entity'

interface UsageRow {
  tokens_used: string | number
  requests_count: string | number
}

/**
 * Anonymized aggregate counter for LLM usage. Stores only per-date totals
 * so the daily token cap is enforced across restarts and multi-instance deployments.
 */
@Injectable()
export class LlmUsageCounterService {
  constructor(
    @InjectRepository(LlmUsageCounter)
    private readonly repo: Repository<LlmUsageCounter>
  ) {}

  /**
   * UTC date key (YYYY-MM-DD), locale-independent.
   */
  static currentDateUsage(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10)
  }

  /**
   * Atomically reserve `tokens` and one request slot for `dateUsage`,
   * returning the new totals after the increment.
   */
  async reserve(
    dateUsage: string,
    tokens: number
  ): Promise<{ tokensUsed: number; requestsCount: number }> {
    const rows = (await this.repo.query(
      `INSERT INTO llm_usage_counter ("dateUsage", "tokensUsed", "requestsCount")
       VALUES ($1, $2, 1)
       ON CONFLICT ("dateUsage") DO UPDATE
         SET "tokensUsed" = llm_usage_counter."tokensUsed" + EXCLUDED."tokensUsed",
             "requestsCount" = llm_usage_counter."requestsCount" + 1
       RETURNING "tokensUsed" AS tokens_used, "requestsCount" AS requests_count`,
      [dateUsage, tokens]
    )) as UsageRow[]
    return this.normalize(rows[0])
  }

  /**
   * Adjust the token total for `dateUsage` by `delta` (may be negative).
   * Used to reconcile reserved tokens against actual billed tokens.
   */
  async adjustTokens(dateUsage: string, delta: number): Promise<void> {
    if (delta === 0) return
    await this.repo.query(
      `UPDATE llm_usage_counter SET "tokensUsed" = GREATEST(0, "tokensUsed" + $2) WHERE "dateUsage" = $1`,
      [dateUsage, delta]
    )
  }

  /**
   * Roll back a reservation entirely (token-wise and request-wise),
   * e.g. after a failed `generateText` call.
   */
  async release(dateUsage: string, tokens: number): Promise<void> {
    await this.repo.query(
      `UPDATE llm_usage_counter
         SET "tokensUsed" = GREATEST(0, "tokensUsed" - $2),
             "requestsCount" = GREATEST(0, "requestsCount" - 1)
       WHERE "dateUsage" = $1`,
      [dateUsage, tokens]
    )
  }

  private normalize(row: UsageRow): {
    tokensUsed: number
    requestsCount: number
  } {
    return {
      tokensUsed: Number(row.tokens_used),
      requestsCount: Number(row.requests_count),
    }
  }
}
