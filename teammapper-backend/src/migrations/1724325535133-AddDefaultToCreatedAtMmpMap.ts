import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDefaultToCreatedAtMmpMap1724325535133 implements MigrationInterface {
    name = 'AddDefaultToCreatedAtMmpMap1724325535133'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" ALTER COLUMN "createdAt" SET DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mmp_map" ALTER COLUMN "createdAt" DROP DEFAULT`);
    }

}
