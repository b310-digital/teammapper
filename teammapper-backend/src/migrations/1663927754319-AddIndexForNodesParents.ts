import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexForNodesParents1663927754319 implements MigrationInterface {
  name = 'AddIndexForNodesParents1663927754319';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX "IDX_336300b82c56a05f0317f22942" ON "mmp_node" ("nodeMapId", "nodeParentId") ');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_336300b82c56a05f0317f22942"');
  }
}
