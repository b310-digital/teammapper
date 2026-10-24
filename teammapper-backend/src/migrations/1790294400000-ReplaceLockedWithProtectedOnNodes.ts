import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The `locked` flag only made a drag move the descendants along, which every
 * drag does now. The migration drops `locked` without converting its values
 * and adds `protected`, which starts false on every node.
 */
export class ReplaceLockedWithProtectedOnNodes1790294400000 implements MigrationInterface {
  name = 'ReplaceLockedWithProtectedOnNodes1790294400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mmp_node" DROP COLUMN "locked"`)
    await queryRunner.query(
      `ALTER TABLE "mmp_node" ADD "protected" boolean NOT NULL DEFAULT false`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mmp_node" DROP COLUMN "protected"`)
    await queryRunner.query(`ALTER TABLE "mmp_node" ADD "locked" boolean`)
  }
}
