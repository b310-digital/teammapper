import {MigrationInterface, QueryRunner} from "typeorm";

export class AdaptForeignKeysOfNodeWithoutCascade1663973636686 implements MigrationInterface {
    name = 'AdaptForeignKeysOfNodeWithoutCascade1663973636686'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" DROP CONSTRAINT "FK_336300b82c56a05f0317f229420"`);
        await queryRunner.query(`ALTER TABLE "mmp_node" ADD CONSTRAINT "FK_336300b82c56a05f0317f229420" FOREIGN KEY ("nodeMapId", "nodeParentId") REFERENCES "mmp_node"("nodeMapId","id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" DROP CONSTRAINT "FK_336300b82c56a05f0317f229420"`);
        await queryRunner.query(`ALTER TABLE "mmp_node" ADD CONSTRAINT "FK_336300b82c56a05f0317f229420" FOREIGN KEY ("nodeMapId", "nodeParentId") REFERENCES "mmp_node"("nodeMapId","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
