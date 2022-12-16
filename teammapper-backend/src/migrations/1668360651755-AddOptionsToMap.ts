import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOptionsToMap1668360651755 implements MigrationInterface {
    name = 'AddOptionsToMap1668360651755'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" ADD "options" jsonb NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" DROP COLUMN "options"`);
    }

}
