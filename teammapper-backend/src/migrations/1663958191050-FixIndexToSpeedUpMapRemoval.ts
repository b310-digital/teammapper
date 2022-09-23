import {MigrationInterface, QueryRunner} from "typeorm";

export class FixIndexToSpeedUpMapRemoval1663958191050 implements MigrationInterface {
    name = 'FixIndexToSpeedUpMapRemoval1663958191050'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_336300b82c56a05f0317f22942"`);
        await queryRunner.query(`CREATE INDEX "IDX_1a1ff8a3417cc16c8f5151cb12" ON "mmp_node" ("id", "nodeMapId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_1a1ff8a3417cc16c8f5151cb12"`);
        await queryRunner.query(`CREATE INDEX "IDX_336300b82c56a05f0317f22942" ON "mmp_node" ("nodeMapId", "nodeParentId") `);
    }

}
