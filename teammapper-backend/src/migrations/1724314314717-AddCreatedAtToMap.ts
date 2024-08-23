import { MigrationInterface, QueryRunner } from "typeorm"

export class AddCreatedAtToMap1724314314717 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "mmp_map" ADD "createdAt" TIMESTAMP WITH TIME ZONE`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" DROP COLUMN "createdAt"`)
    }

}
