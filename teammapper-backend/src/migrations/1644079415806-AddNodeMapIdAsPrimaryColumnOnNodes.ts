import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNodeMapIdAsPrimaryColumnOnNodes1644079415806 implements MigrationInterface {
  name = 'AddNodeMapIdAsPrimaryColumnOnNodes1644079415806';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM "public"."mmp_node" WHERE "nodeMapId" IS NULL');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" DROP CONSTRAINT "FK_9919032f542cee8cab97749e1a5"');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" DROP CONSTRAINT "PK_70f65b529c3e785462fb35c05cf"');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ADD CONSTRAINT "PK_1a1ff8a3417cc16c8f5151cb124" PRIMARY KEY ("id", "nodeMapId")');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" DROP CONSTRAINT "FK_19c5208da416d32ea491315716e"');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ALTER COLUMN "nodeMapId" SET NOT NULL');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ADD CONSTRAINT "FK_19c5208da416d32ea491315716e" FOREIGN KEY ("nodeMapId") REFERENCES "mmp_map"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ADD CONSTRAINT "FK_336300b82c56a05f0317f229420" FOREIGN KEY ("nodeMapId", "nodeParentId") REFERENCES "mmp_node"("nodeMapId","id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "public"."mmp_node" DROP CONSTRAINT "FK_336300b82c56a05f0317f229420"');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" DROP CONSTRAINT "FK_19c5208da416d32ea491315716e"');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ALTER COLUMN "nodeMapId" DROP NOT NULL');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ADD CONSTRAINT "FK_19c5208da416d32ea491315716e" FOREIGN KEY ("nodeMapId") REFERENCES "mmp_map"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" DROP CONSTRAINT "PK_1a1ff8a3417cc16c8f5151cb124"');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ADD CONSTRAINT "PK_70f65b529c3e785462fb35c05cf" PRIMARY KEY ("id")');
    await queryRunner.query('ALTER TABLE "public"."mmp_node" ADD CONSTRAINT "FK_9919032f542cee8cab97749e1a5" FOREIGN KEY ("nodeParentId") REFERENCES "mmp_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

}
