import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkHrefToNode1678605712865 implements MigrationInterface {
    name = 'AddLinkHrefToNode1678605712865'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" ADD "linkHref" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_node" DROP COLUMN "linkHref"`);
    }

}
