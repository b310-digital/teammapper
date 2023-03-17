import { MigrationInterface, QueryRunner } from "typeorm";

export class AddModificationSecretToMaps1678976170981 implements MigrationInterface {
    name = 'AddModificationSecretToMaps1678976170981'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" ADD "modificationSecret" uuid NULL`);
        await queryRunner.query(`ALTER TABLE "mmp_map" ALTER "modificationSecret" SET DEFAULT uuid_generate_v4()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" DROP COLUMN "modificationSecret"`);
    }

}
