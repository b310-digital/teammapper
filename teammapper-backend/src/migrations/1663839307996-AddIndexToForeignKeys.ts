import {MigrationInterface, QueryRunner} from "typeorm";

export class AddIndexToForeignKeys1663839307996 implements MigrationInterface {
    name = 'AddIndexToForeignKeys1663839307996'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_19c5208da416d32ea491315716" ON "mmp_node" ("nodeMapId") `);
        await queryRunner.query(`CREATE INDEX "IDX_9919032f542cee8cab97749e1a" ON "mmp_node" ("nodeParentId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_9919032f542cee8cab97749e1a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_19c5208da416d32ea491315716"`);
    }

}
