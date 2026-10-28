import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Creates `mmp_arrow`, one row per directed arrow between two nodes of a map.
 * The primary key is (nodeMapId, sourceNodeId, targetNodeId). Two composite
 * foreign keys reference `mmp_node` on its primary key columns, so an arrow
 * cannot name a node of another map, and both cascade on delete. Moves no data.
 */
export class AddArrowTable1790380800000 implements MigrationInterface {
  name = 'AddArrowTable1790380800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mmp_arrow" (
        "nodeMapId" uuid NOT NULL,
        "sourceNodeId" uuid NOT NULL,
        "targetNodeId" uuid NOT NULL,
        CONSTRAINT "PK_mmp_arrow" PRIMARY KEY ("nodeMapId", "sourceNodeId", "targetNodeId"),
        CONSTRAINT "FK_mmp_arrow_nodeMapId" FOREIGN KEY ("nodeMapId") REFERENCES "mmp_map"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mmp_arrow_source" FOREIGN KEY ("sourceNodeId", "nodeMapId") REFERENCES "mmp_node"("id", "nodeMapId") ON DELETE CASCADE,
        CONSTRAINT "FK_mmp_arrow_target" FOREIGN KEY ("targetNodeId", "nodeMapId") REFERENCES "mmp_node"("id", "nodeMapId") ON DELETE CASCADE
      )`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mmp_arrow"`)
  }
}
