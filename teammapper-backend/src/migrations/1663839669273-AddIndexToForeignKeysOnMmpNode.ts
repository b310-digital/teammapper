import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIndexToForeignKeysOnMmpNode1663839669273
    implements MigrationInterface
{
    name = "AddIndexToForeignKeysOnMmpNode1663839669273";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'CREATE INDEX "IDX_19c5208da416d32ea491315716" ON "mmp_node" ("nodeMapId") ',
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'DROP INDEX "public"."IDX_19c5208da416d32ea491315716"',
        );
    }
}
