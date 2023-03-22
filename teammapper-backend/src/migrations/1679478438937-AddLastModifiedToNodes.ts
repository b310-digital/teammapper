import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastModifiedToNodes1679478438937 implements MigrationInterface {
    name = 'AddLastModifiedToNodes1679478438937'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" ADD "lastModified" TIMESTAMP WITH TIME ZONE DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" DROP COLUMN "lastModified"`);
    }

}
