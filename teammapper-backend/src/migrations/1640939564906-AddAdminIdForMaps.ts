import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminIdForMaps1640939564906 implements MigrationInterface {
  name = 'AddAdminIdForMaps1640939564906';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "public"."mmp_map" ADD "adminId" uuid DEFAULT uuid_generate_v4()');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "public"."mmp_map" DROP COLUMN "adminId"');
  }

}
