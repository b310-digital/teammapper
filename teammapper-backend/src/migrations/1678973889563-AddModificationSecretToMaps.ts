import { MigrationInterface, QueryRunner } from "typeorm";

export class AddModificationSecretToMaps1678973889563 implements MigrationInterface {
    name = 'AddModificationSecretToMaps1678973889563'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" ADD "modificationSecret" uuid DEFAULT uuid_generate_v4()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" DROP COLUMN "modificationSecret"`);
    }

}
