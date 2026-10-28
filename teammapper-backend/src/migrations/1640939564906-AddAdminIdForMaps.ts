import { MigrationInterface, QueryRunner } from 'typeorm'
import { uuidGenerator } from '../uuidGeneration'

export class AddAdminIdForMaps1640939564906 implements MigrationInterface {
  name = 'AddAdminIdForMaps1640939564906'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const generator = await uuidGenerator(queryRunner)
    await queryRunner.query(
      `ALTER TABLE "public"."mmp_map" ADD "adminId" uuid DEFAULT ${generator}`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "public"."mmp_map" DROP COLUMN "adminId"'
    )
  }
}
