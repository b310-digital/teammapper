import { Entity, Column, PrimaryColumn } from 'typeorm'

/**
 * Anonymized aggregate counter for LLM usage.
 * Used to enforce daily token caps across restarts and multi-instance deployments.
 */
@Entity('llm_usage_counter')
export class LlmUsageCounter {
  @PrimaryColumn({ type: 'date' })
  dateUsage: string

  @Column({ type: 'bigint', default: '0' })
  tokensUsed: string

  @Column({ type: 'bigint', default: '0' })
  requestsCount: string
}
