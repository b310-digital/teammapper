import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A detached node becomes a root: the renderer already drew every detached
 * node without a parent, so the up-migration nulls the parent of any detached
 * row that still names one before it drops the column.
 */
export class DropDetachedPropertyFromNodes1790121600000 implements MigrationInterface {
  name = 'DropDetachedPropertyFromNodes1790121600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "mmp_node" SET "nodeParentId" = NULL WHERE "detached" = true AND "nodeParentId" IS NOT NULL`
    )
    await queryRunner.query(`ALTER TABLE "mmp_node" DROP COLUMN "detached"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mmp_node" ADD "detached" boolean NOT NULL DEFAULT false`
    )
  }
}
