import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDefaultTimestampToMaps1640704269037 implements MigrationInterface {
  name = 'AddDefaultTimestampToMaps1640704269037'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "public"."mmp_map" ALTER COLUMN "lastModified" SET DEFAULT now()'
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "public"."mmp_map" ALTER COLUMN "lastModified" DROP DEFAULT'
    )
  }
}
