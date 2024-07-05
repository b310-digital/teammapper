import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHiddenFieldToNodes1720171734964 implements MigrationInterface {
    name = 'AddHiddenFieldToNodes1720171734964'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" ADD "hidden" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" DROP COLUMN "hidden"`);
    }

}
