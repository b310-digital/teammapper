import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddOwnerId1765782220832 implements MigrationInterface {
  name = 'AddOwnerId1765782220832'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mmp_map" ADD "ownerExternalId" character varying`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mmp_map" DROP COLUMN "ownerExternalId"`
    )
  }
}
