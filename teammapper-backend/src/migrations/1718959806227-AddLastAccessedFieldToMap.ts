import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastAccessedFieldToMap1718959806227 implements MigrationInterface {
    name = 'AddLastAccessedFieldToMap1718959806227'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" ADD "lastAccessed" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" DROP COLUMN "lastAccessed"`);
    }

}
