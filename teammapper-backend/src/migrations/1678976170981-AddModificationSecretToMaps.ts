import { MigrationInterface, QueryRunner } from 'typeorm'
import { uuidGenerator } from '../uuidGeneration'

export class AddModificationSecretToMaps1678976170981 implements MigrationInterface {
  name = 'AddModificationSecretToMaps1678976170981'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mmp_map" ADD "modificationSecret" uuid NULL`
    )
    const generator = await uuidGenerator(queryRunner)
    await queryRunner.query(
      `ALTER TABLE "mmp_map" ALTER "modificationSecret" SET DEFAULT ${generator}`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mmp_map" DROP COLUMN "modificationSecret"`
    )
  }
}
