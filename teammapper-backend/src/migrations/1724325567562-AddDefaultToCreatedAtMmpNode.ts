import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDefaultToCreatedAtMmpNode1724325567562
  implements MigrationInterface
{
  name = 'AddDefaultToCreatedAtMmpNode1724325567562'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mmp_node" ALTER COLUMN "createdAt" SET DEFAULT now()`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mmp_node" ALTER COLUMN "createdAt" DROP DEFAULT`
    )
  }
}
