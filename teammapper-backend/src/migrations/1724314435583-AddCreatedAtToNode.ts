import { MigrationInterface, QueryRunner } from "typeorm"

export class AddCreatedAtToNode1724314435583 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "mmp_node" ADD "createdAt" TIMESTAMP WITH TIME ZONE`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" DROP COLUMN "createdAt"`)
    }

}
