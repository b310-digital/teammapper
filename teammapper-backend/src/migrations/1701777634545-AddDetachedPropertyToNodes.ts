import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDetachedPropertyToNodes1701777634545
    implements MigrationInterface
{
    name = "AddDetachedPropertyToNodes1701777634545";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "mmp_node" ADD "detached" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "mmp_node" DROP COLUMN "detached"`,
        );
    }
}
