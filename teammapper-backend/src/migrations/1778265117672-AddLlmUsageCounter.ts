import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddLlmUsageCounter1778265117672 implements MigrationInterface {
  name = 'AddLlmUsageCounter1778265117672'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "llm_usage_counter" (
        "dateUsage" date NOT NULL,
        "tokensUsed" bigint NOT NULL DEFAULT 0,
        "requestsCount" bigint NOT NULL DEFAULT 0,
        CONSTRAINT "PK_llm_usage_counter_dateUsage" PRIMARY KEY ("dateUsage")
      )`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "llm_usage_counter"`)
  }
}
